<?php

namespace Modules\ImportExport\Services\Vanille;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Services\ProductDescriptionRewriter;
use Modules\Catalog\Services\ProductImageVariantService;
use Modules\Catalog\Support\ProductImagePathResolver;
use Modules\Catalog\Support\PublicStorageWriteGuard;
use Modules\ImportExport\Models\ImportRetryItem;
use Modules\ImportExport\Services\ImportRetryQueue;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleCatalogImageParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleProductParser;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;
use Modules\ImportExport\Support\LegacyProductDetector;
use Throwable;

class VanilleMediaImportService
{
    private const int CATALOG_BRANDS_PER_BATCH = 1;

    private const int GALLERY_PRODUCTS_PER_BATCH = 3;

    private const int DESCRIPTION_PRODUCTS_PER_BATCH = 2;

    private const int RETRY_PRODUCTS_PER_BATCH = 5;

    /** Ограничитель на случай ошибок парсера/бесконечной пагинации. */
    private const int MAX_BRAND_LISTING_PAGES = 200;

    public function __construct(
        protected VanilleHttpClient $httpClient,
        protected VanilleCatalogImageParser $catalogImageParser,
        protected VanilleProductParser $productParser,
        protected ImportRetryQueue $importRetryQueue,
        protected LegacyProductDetector $legacyDetector,
        protected ProductImageVariantService $imageVariantService,
    ) {
    }

    private static function hasProductImagesExtendedSchema(): bool
    {
        return Schema::hasColumn('product_images', 'usage_type');
    }

    private function catalogImagesCountForProduct(int $productId): int
    {
        if (self::hasProductImagesExtendedSchema()) {
            return (int) ProductImage::query()
                ->where('product_id', $productId)
                ->where('usage_type', ProductImage::USAGE_CATALOG)
                ->count();
        }

        return (int) ProductImage::query()
            ->where('product_id', $productId)
            ->where('path', 'like', '%/catalog/%')
            ->count();
    }

    public function runCatalogImagesBatch(int $brandOffset, int $brandLimit = self::CATALOG_BRANDS_PER_BATCH): array
    {
        PublicStorageWriteGuard::assertProductImagesWritable();

        $brandsPath = storage_path('app/public/imports/vanille/brands.json');
        if (! is_file($brandsPath)) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Каталожные картинки: нет brands.json',
                'result' => ['log' => ['SKIP: brands.json missing'], 'failed_count' => 0],
            ];
        }

        $brands = json_decode((string) file_get_contents($brandsPath), true);
        if (! is_array($brands)) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Каталожные картинки: brands.json повреждён',
                'result' => ['log' => ['ERROR: invalid brands.json'], 'failed_count' => 0],
            ];
        }

        $brands = VanilleBrandParser::filterExcludedListingRows($brands);

        $totalBrands = count($brands);
        if ($totalBrands === 0) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Каталожные картинки: список брендов пуст',
                'result' => ['log' => [], 'failed_count' => 0],
            ];
        }

        $chunk = array_slice($brands, $brandOffset, $brandLimit);
        $log = [];
        $failed = 0;

        foreach ($chunk as $brand) {
            $url = (string) ($brand['source_url'] ?? $brand['url'] ?? '');
            if ($url === '') {
                continue;
            }

            $brandSlug = (string) ($brand['slug'] ?? '');
            try {
                $rows = $this->collectBrandListingRows($url, $brandSlug !== '' ? $brandSlug : null);
            } catch (Throwable $e) {
                $log[] = 'ERROR brand page: '.$url.' -> '.$e->getMessage();
                continue;
            }

            foreach ($rows as $row) {
                $slug = (string) ($row['slug'] ?? '');
                $imageUrls = $this->normalizeListingImageUrls($row['image_urls'] ?? [$row['image_url'] ?? null]);
                if ($slug === '' || $imageUrls === []) {
                    continue;
                }

                $supplierProduct = $this->resolveVanilleSupplierProductBySlug($slug);
                if (! $supplierProduct || ! $supplierProduct->product_id) {
                    continue;
                }
                $productId = (int) $supplierProduct->product_id;

                try {
                    foreach ($imageUrls as $imgUrl) {
                        $this->storeCatalogImageForProduct($productId, $imgUrl, $slug);
                    }
                    $this->importRetryQueue->markResolved(ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES, $productId);
                } catch (Throwable $e) {
                    $this->abortIfStorageWriteError($e);
                    $failed++;
                    $this->importRetryQueue->record(
                        ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES,
                        $productId,
                        $e->getMessage(),
                        ['slug' => $slug, 'image_urls' => $imageUrls],
                    );
                    $log[] = 'ERROR product '.$productId.' slug='.$slug.' -> '.$e->getMessage();
                }
            }
        }

        $nextOffset = $brandOffset + count($chunk);
        $done = $nextOffset >= $totalBrands;
        $progress = $done ? 100 : max(5, min(95, (int) round(($nextOffset / $totalBrands) * 100)));

        return [
            'done' => $done,
            'progress' => $progress,
            'message' => sprintf('Каталожные картинки: бренды %d / %d', min($nextOffset, $totalBrands), $totalBrands),
            'result' => [
                'state' => ['brand_offset' => $nextOffset, 'brand_limit' => $brandLimit],
                'log' => $log,
                'failed_count' => $failed,
                'processed_brands' => min($nextOffset, $totalBrands),
                'total_brands' => $totalBrands,
            ],
        ];
    }

    public function runProductGalleryBatch(int $offset, int $limit = self::GALLERY_PRODUCTS_PER_BATCH): array
    {
        PublicStorageWriteGuard::assertProductImagesWritable();

        $supplierId = $this->vanilleSupplierId();
        if ($supplierId === 0) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Галерея: поставщик Vanille не найден',
                'result' => ['log' => [], 'failed_count' => 0],
            ];
        }

        $query = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->where('is_linked', true)
            ->whereNotNull('product_id')
            ->orderBy('id');

        $total = (clone $query)->count();
        if ($total === 0) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Галерея: нет связанных товаров',
                'result' => ['log' => [], 'failed_count' => 0],
            ];
        }

        $items = $query->offset($offset)->limit($limit)->get();
        $productIds = $items->pluck('product_id')->map(fn ($id) => (int) $id)->filter()->unique()->values()->all();
        $this->legacyDetector->preload($productIds);

        $log = [];
        $failed = 0;

        foreach ($items as $sp) {
            $productId = (int) $sp->product_id;
            if ($productId <= 0) {
                continue;
            }

            if ($this->legacyDetector->isLegacy($productId)) {
                $this->importRetryQueue->markResolved(ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES, $productId);
                continue;
            }

            $url = trim((string) $sp->external_url);
            if ($url === '') {
                $this->importRetryQueue->record(
                    ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES,
                    $productId,
                    'empty external_url',
                    [],
                );
                $failed++;
                continue;
            }

            try {
                $html = $this->httpClient->fetchUrl($url, 20);
                $gallery = $this->productParser->parseGalleryImageUrlsFromHtml($html);
                if ($gallery === []) {
                    $this->importRetryQueue->record(
                        ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES,
                        $productId,
                        'no gallery urls parsed',
                        ['url' => $url],
                    );
                    $failed++;
                    continue;
                }

                $saved = 0;
                foreach (array_slice($gallery, 0, 8) as $imgUrl) {
                    try {
                        if ($this->productImageSourceExists($productId, $imgUrl)) {
                            continue;
                        }
                        $this->storeGalleryImage($productId, $imgUrl);
                        $saved++;
                    } catch (Throwable $e) {
                        $this->abortIfStorageWriteError($e);
                        $log[] = 'WARN product '.$productId.' img '.$imgUrl.' -> '.$e->getMessage();
                    }
                }

                if ($saved === 0 && $gallery !== []) {
                    $this->importRetryQueue->record(
                        ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES,
                        $productId,
                        'gallery download failed for all urls',
                        ['url' => $url],
                    );
                    $failed++;
                } else {
                    $this->importRetryQueue->markResolved(ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES, $productId);
                }
            } catch (Throwable $e) {
                $this->abortIfStorageWriteError($e);
                $failed++;
                $this->importRetryQueue->record(
                    ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES,
                    $productId,
                    $e->getMessage(),
                    ['url' => $url],
                );
                $log[] = 'ERROR product '.$productId.' -> '.$e->getMessage();
            }
        }

        $nextOffset = $offset + $items->count();
        $done = $nextOffset >= $total;
        $progress = $done ? 100 : max(5, min(95, (int) round(($nextOffset / max(1, $total)) * 100)));

        return [
            'done' => $done,
            'progress' => $progress,
            'message' => sprintf('Галерея: товары %d / %d', min($nextOffset, $total), $total),
            'result' => [
                'state' => ['offset' => $nextOffset, 'limit' => $limit],
                'log' => $log,
                'failed_count' => $failed,
                'processed' => min($nextOffset, $total),
                'total' => $total,
            ],
        ];
    }

    public function runDescriptionRewriteBatch(int $offset, int $limit = self::DESCRIPTION_PRODUCTS_PER_BATCH): array
    {
        $query = Product::query()
            ->whereNotNull('description')
            ->where('description', '!=', '')
            ->whereNull('description_rewritten_at')
            ->orderBy('id');

        $total = (clone $query)->count();
        if ($total === 0) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Описания: нечего уникализировать',
                'result' => ['log' => [], 'failed_count' => 0],
            ];
        }

        $products = $query->offset($offset)->limit($limit)->get();
        $this->legacyDetector->preload($products->pluck('id')->all());

        $log = [];
        $failed = 0;
        $ok = 0;

        foreach ($products as $product) {
            $pid = (int) $product->id;
            if ($this->legacyDetector->isLegacy($pid)) {
                $this->importRetryQueue->markResolved(ImportRetryItem::TASK_DESCRIPTION_REWRITE, $pid);
                continue;
            }

            $res = $this->descriptionRewriter()->rewriteProduct($product);
            if (! ($res['ok'] ?? false)) {
                $err = (string) ($res['error'] ?? 'unknown');
                if ($err === 'legacy_skip' || $err === 'source_too_short') {
                    $this->importRetryQueue->markResolved(ImportRetryItem::TASK_DESCRIPTION_REWRITE, $pid);
                } else {
                    $failed++;
                    $this->importRetryQueue->record(
                        ImportRetryItem::TASK_DESCRIPTION_REWRITE,
                        $pid,
                        $err,
                        ['len' => mb_strlen((string) $product->description), 'prompt_hash' => hash('sha256', (string) $product->id)],
                    );
                }
                $log[] = 'SKIP/ERR product '.$pid.': '.$err;
                continue;
            }

            try {
                DB::transaction(function () use ($product, $res): void {
                    $product->update([
                        'description' => $res['description'],
                        'description_rewritten_at' => now(),
                    ]);
                });
                $ok++;
                $this->importRetryQueue->markResolved(ImportRetryItem::TASK_DESCRIPTION_REWRITE, $pid);
            } catch (Throwable $e) {
                $failed++;
                $this->importRetryQueue->record(
                    ImportRetryItem::TASK_DESCRIPTION_REWRITE,
                    $pid,
                    $e->getMessage(),
                    [],
                );
            }
        }

        $nextOffset = $offset + $products->count();
        $done = $nextOffset >= $total;
        $progress = $done ? 100 : max(5, min(95, (int) round(($nextOffset / max(1, $total)) * 100)));

        return [
            'done' => $done,
            'progress' => $progress,
            'message' => sprintf('Описания: %d / %d (ok=%d)', min($nextOffset, $total), $total, $ok),
            'result' => [
                'state' => ['offset' => $nextOffset, 'limit' => $limit],
                'log' => $log,
                'failed_count' => $failed,
                'rewritten_ok' => $ok,
                'processed' => min($nextOffset, $total),
                'total' => $total,
            ],
        ];
    }

    /**
     * @param  list<int>|null  $onlyProductIds
     */
    public function runRetryFailedBatch(string $taskType, int $offset, int $limit = self::RETRY_PRODUCTS_PER_BATCH, ?array $onlyProductIds = null): array
    {
        if (in_array($taskType, [
            ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES,
            ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES,
        ], true)) {
            PublicStorageWriteGuard::assertProductImagesWritable();
        }

        $ids = $onlyProductIds ?? $this->importRetryQueue->pendingProductIds($taskType, $limit, $offset);
        if ($ids === []) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Retry: очередь пуста',
                'result' => ['task_type' => $taskType, 'processed' => 0, 'failed_count' => 0],
            ];
        }

        $failed = 0;
        foreach ($ids as $productId) {
            try {
                match ($taskType) {
                    ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES => $this->retryOneCatalogImage((int) $productId),
                    ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES => $this->retryOneGallery((int) $productId),
                    ImportRetryItem::TASK_DESCRIPTION_REWRITE => $this->retryOneDescription((int) $productId),
                    default => throw new \InvalidArgumentException('Unknown task_type'),
                };
            } catch (Throwable $e) {
                $this->abortIfStorageWriteError($e);
                $failed++;
                $this->importRetryQueue->record($taskType, (int) $productId, $e->getMessage(), []);
            }
        }

        return [
            'done' => true,
            'progress' => 100,
            'message' => 'Retry: пачка обработана',
            'result' => [
                'task_type' => $taskType,
                'processed' => count($ids),
                'failed_count' => $failed,
            ],
        ];
    }

    private function retryOneCatalogImage(int $productId): void
    {
        $sp = SupplierProduct::query()
            ->where('product_id', $productId)
            ->whereHas('supplier', fn ($q) => $q->where('code', 'vanille'))
            ->first();
        if (! $sp) {
            throw new \RuntimeException('Нет supplier_product Vanille для product_id='.$productId);
        }
        $slug = trim((string) ($sp->external_slug ?? ''));
        if ($slug === '' && $sp->external_url) {
            $slug = trim((string) parse_url((string) $sp->external_url, PHP_URL_PATH), '/');
        }
        if ($slug === '') {
            throw new \RuntimeException('Не удалось определить slug');
        }

        $brand = $sp->brand;
        $brandsPath = storage_path('app/public/imports/vanille/brands.json');
        $decoded = is_file($brandsPath) ? json_decode((string) file_get_contents($brandsPath), true) : [];
        $brands = is_array($decoded) ? VanilleBrandParser::filterExcludedListingRows($decoded) : [];
        $brandUrl = null;
        if ($brands !== []) {
            foreach ($brands as $b) {
                if (! is_array($b)) {
                    continue;
                }
                if (isset($b['slug']) && mb_strtolower((string) $b['slug']) === mb_strtolower((string) ($brand?->slug ?? ''))) {
                    $brandUrl = (string) ($b['source_url'] ?? $b['url'] ?? '');
                    break;
                }
            }
        }
        if ($brandUrl === '') {
            throw new \RuntimeException('Не найден URL бренда в brands.json');
        }

        $sp->loadMissing('brand');
        $brandSlug = (string) ($sp->brand?->slug ?? '');
        $rows = $this->collectBrandListingRows($brandUrl, $brandSlug !== '' ? $brandSlug : null);
        $listingImageUrls = [];
        foreach ($rows as $row) {
            if (mb_strtolower(trim((string) ($row['slug'] ?? ''))) === mb_strtolower($slug)) {
                $listingImageUrls = $this->normalizeListingImageUrls($row['image_urls'] ?? [$row['image_url'] ?? null]);
                break;
            }
        }
        if ($listingImageUrls === []) {
            throw new \RuntimeException('Картинка на листинге не найдена для slug='.$slug);
        }

        if ($this->catalogImagesCountForProduct($productId) >= 2) {
            $this->importRetryQueue->markResolved(ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES, $productId);

            return;
        }

        foreach ($listingImageUrls as $listingImageUrl) {
            $this->storeCatalogImageForProduct($productId, $listingImageUrl, $slug);
        }
        $this->importRetryQueue->markResolved(ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES, $productId);
    }

    private function retryOneGallery(int $productId): void
    {
        if ($this->legacyDetector->isLegacy($productId)) {
            $this->importRetryQueue->markResolved(ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES, $productId);

            return;
        }
        $sp = SupplierProduct::query()
            ->where('product_id', $productId)
            ->whereHas('supplier', fn ($q) => $q->where('code', 'vanille'))
            ->firstOrFail();
        $url = trim((string) $sp->external_url);
        $html = $this->httpClient->fetchUrl($url, 20);
        $gallery = $this->productParser->parseGalleryImageUrlsFromHtml($html);
        if ($gallery === []) {
            throw new \RuntimeException('Нет URL галереи');
        }
        $saved = 0;
        foreach (array_slice($gallery, 0, 8) as $imgUrl) {
            if ($this->productImageSourceExists($productId, $imgUrl)) {
                continue;
            }
            $this->storeGalleryImage($productId, $imgUrl);
            $saved++;
        }
        if ($saved === 0) {
            throw new \RuntimeException('Не удалось сохранить ни одного изображения');
        }
        $this->importRetryQueue->markResolved(ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES, $productId);
    }

    private function retryOneDescription(int $productId): void
    {
        $product = Product::query()->findOrFail($productId);
        $res = $this->descriptionRewriter()->rewriteProduct($product);
        if (! ($res['ok'] ?? false)) {
            throw new \RuntimeException((string) ($res['error'] ?? 'rewrite failed'));
        }
        $product->update([
            'description' => $res['description'],
            'description_rewritten_at' => now(),
        ]);
        $this->importRetryQueue->markResolved(ImportRetryItem::TASK_DESCRIPTION_REWRITE, $productId);
    }

    private function vanilleSupplierId(): int
    {
        return (int) Supplier::query()->where('code', 'vanille')->value('id');
    }

    private function resolveVanilleSupplierProductBySlug(string $slug): ?SupplierProduct
    {
        $supplierId = $this->vanilleSupplierId();
        if ($supplierId === 0) {
            return null;
        }

        $slugLower = mb_strtolower($slug);

        return SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->where('is_linked', true)
            ->whereNotNull('product_id')
            ->where(function ($q) use ($slug, $slugLower): void {
                $q->whereRaw('LOWER(external_slug) = ?', [$slugLower])
                    ->orWhere('external_url', 'like', '%/'.$slug)
                    ->orWhere('external_url', 'like', '%/'.$slugLower);
            })
            ->first();
    }

    /**
     * Все страницы листинга бренда (напр. /ajmal, /ajmal?page=2…) с дедупликацией по slug.
     *
     * @return list<array{slug:string, image_url:?string}>
     */
    private function collectBrandListingRows(string $brandPageUrl, ?string $brandSlug): array
    {
        $seen = [];
        $out = [];
        $maxHint = 1;
        $page = 1;

        while ($page <= self::MAX_BRAND_LISTING_PAGES) {
            $fetchUrl = $this->listingUrlWithPage($brandPageUrl, $page);

            try {
                $html = $this->httpClient->fetchUrl($fetchUrl, 15);
            } catch (Throwable) {
                break;
            }

            $maxHint = max(
                $maxHint,
                min(
                    self::MAX_BRAND_LISTING_PAGES,
                    $this->catalogImageParser->maxListingPageFromHtml($html),
                ),
            );

            $rows = $this->catalogImageParser->parseListing($html, $brandSlug);
            if ($rows === []) {
                break;
            }

            $newCount = 0;
            foreach ($rows as $row) {
                $s = trim((string) ($row['slug'] ?? ''));
                if ($s === '' || isset($seen[$s])) {
                    continue;
                }
                $seen[$s] = true;
                $out[] = $row;
                $newCount++;
            }

            if ($page > 1 && $newCount === 0) {
                break;
            }

            if ($maxHint > 1 && $page >= $maxHint) {
                break;
            }

            $page++;
        }

        return $out;
    }

    private function listingUrlWithPage(string $baseUrl, int $page): string
    {
        $baseUrl = trim($baseUrl);
        $host = parse_url($baseUrl, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            throw new \InvalidArgumentException('Некорректный URL бренда для листинга: '.$baseUrl);
        }

        parse_str((string) (parse_url($baseUrl, PHP_URL_QUERY) ?? ''), $queryParams);

        if ($page <= 1) {
            unset($queryParams['page']);
        } else {
            $queryParams['page'] = $page;
        }

        ksort($queryParams);
        $query = http_build_query($queryParams);

        $scheme = (string) (parse_url($baseUrl, PHP_URL_SCHEME) ?? 'https');
        $path = (string) (parse_url($baseUrl, PHP_URL_PATH) ?? '');
        $port = parse_url($baseUrl, PHP_URL_PORT);
        $fragment = parse_url($baseUrl, PHP_URL_FRAGMENT);

        return $scheme.'://'.$host
            .(is_int($port) ? ':'.$port : '')
            .$path
            .($query !== '' ? '?'.$query : '')
            .(is_string($fragment) && $fragment !== '' ? '#'.$fragment : '');
    }

    private function productImageSourceExists(int $productId, string $sourceUrl): bool
    {
        if (! Schema::hasColumn('product_images', 'source_url')) {
            return false;
        }

        return ProductImage::query()
            ->where('product_id', $productId)
            ->where('source_url', $sourceUrl)
            ->exists();
    }

    /**
     * Всегда string (никогда null) — иначе при string $imageUrl в сигнатуре PHP падает TypeError до тела метода.
     */
    private function normalizeListingImageUrl(mixed $raw): string
    {
        if ($raw === null || $raw === false) {
            return '';
        }
        if (is_string($raw)) {
            return trim($raw);
        }

        return trim((string) $raw);
    }

    /**
     * @param  mixed  $raw
     * @return list<string>
     */
    private function normalizeListingImageUrls(mixed $raw): array
    {
        $items = is_array($raw) ? $raw : [$raw];
        $out = [];
        $seen = [];

        foreach ($items as $item) {
            $url = $this->normalizeListingImageUrl($item);
            if ($url === '' || isset($seen[$url])) {
                continue;
            }
            $seen[$url] = true;
            $out[] = $url;
            if (count($out) >= 2) {
                break;
            }
        }

        return $out;
    }

    /**
     * Второй аргумент без native type: иначе PHP 8 кидает TypeError на null до trim(), что ломает ретраи при любой рассинхронизации кода/OPcache.
     *
     * @param  string|null  $imageUrl
     */
    private function storeCatalogImageForProduct(int $productId, $imageUrl, string $slug): void
    {
        $imageUrl = trim((string) ($imageUrl ?? ''));
        if ($imageUrl === '') {
            throw new \RuntimeException('Пустой URL каталожной картинки для slug='.$slug);
        }

        $catalogCount = $this->catalogImagesCountForProduct($productId);
        if ($catalogCount >= 2) {
            return;
        }

        $binary = $this->downloadBinary($imageUrl);
        $hash = sha1($binary);

        $disk = Storage::disk('public');
        $directory = 'products/'.$productId.'/catalog';
        $variantPaths = $this->imageVariantService->generateFromBinary(
            $binary,
            $disk,
            $directory,
            'catalog',
            1,
            'catalog-'.$hash
        );

        $dbPath = $variantPaths['path'];
        if (ProductImage::query()->where('product_id', $productId)->where('path', $dbPath)->exists()) {
            return;
        }

        $maxSort = (int) ProductImage::query()->where('product_id', $productId)->max('sort_order');
        $isFirstCatalogImage = $catalogCount === 0;
        if ($isFirstCatalogImage) {
            ProductImage::query()
                ->where('product_id', $productId)
                ->update(['is_main' => false]);
        }
        $row = [
            'product_id' => $productId,
            'path' => $variantPaths['path'],
            'alt' => null,
            'sort_order' => $maxSort + 1,
            'is_main' => $isFirstCatalogImage,
        ];
        if (ProductImagePathResolver::hasVariantColumns()) {
            $row['path_full'] = $variantPaths['path_full'];
            $row['path_card'] = $variantPaths['path_card'];
            $row['path_listing'] = $variantPaths['path_listing'];
            $row['path_thumb'] = $variantPaths['path_thumb'];
        }
        if (self::hasProductImagesExtendedSchema()) {
            $row['usage_type'] = ProductImage::USAGE_CATALOG;
            $row['source_url'] = $imageUrl;
            $row['watermark_status'] = ProductImage::WATERMARK_NONE;
            $row['watermark_meta'] = null;
        }
        ProductImage::query()->create($row);
    }

    private function storeGalleryImage(int $productId, string $imageUrl): void
    {
        $binary = $this->downloadBinary($imageUrl);
        [$processed, $wmStatus, $meta] = $this->processWatermarkBinary($binary);

        $hash = sha1($processed);

        $disk = Storage::disk('public');
        $directory = 'products/'.$productId;
        $variantPaths = $this->imageVariantService->generateFromBinary(
            $processed,
            $disk,
            $directory,
            'vanille',
            1,
            'vanille-'.$hash
        );

        $dbPath = $variantPaths['path'];
        if (ProductImage::query()->where('product_id', $productId)->where('path', $dbPath)->exists()) {
            return;
        }

        $maxSort = (int) ProductImage::query()->where('product_id', $productId)->max('sort_order');
        $hasMain = ProductImage::query()->where('product_id', $productId)->where('is_main', true)->exists();

        $row = [
            'product_id' => $productId,
            'path' => $variantPaths['path'],
            'alt' => null,
            'sort_order' => $maxSort + 1,
            'is_main' => ! $hasMain,
        ];
        if (ProductImagePathResolver::hasVariantColumns()) {
            $row['path_full'] = $variantPaths['path_full'];
            $row['path_card'] = $variantPaths['path_card'];
            $row['path_listing'] = $variantPaths['path_listing'];
            $row['path_thumb'] = $variantPaths['path_thumb'];
        }
        if (self::hasProductImagesExtendedSchema()) {
            $row['usage_type'] = ProductImage::USAGE_GALLERY;
            $row['source_url'] = $imageUrl;
            $row['watermark_status'] = $wmStatus;
            $row['watermark_meta'] = $meta;
        }
        ProductImage::query()->create($row);
    }

    private function downloadBinary(string $url): string
    {
        $response = Http::timeout(45)->retry(2, 1000)->get($url);
        if (! $response->successful()) {
            throw new \RuntimeException('HTTP '.$response->status().' for '.$url);
        }
        $body = $response->body();
        if ($body === '') {
            throw new \RuntimeException('Empty body for '.$url);
        }

        return $body;
    }

    /**
     * @return array{0: string, 1: string, 2: array<string, mixed>}
     */
    private function processWatermarkBinary(string $binary): array
    {
        $class = \Modules\Catalog\Services\ImageWatermarkService::class;

        if (! class_exists($class)) {
            return [$binary, ProductImage::WATERMARK_NEEDS_REVIEW, ['reason' => 'service_class_missing']];
        }

        try {
            /** @var object $service */
            $service = app($class);
            if (method_exists($service, 'processImageBinary')) {
                /** @var array{0: string, 1: string, 2: array<string, mixed>} $result */
                $result = $service->processImageBinary($binary);

                return $result;
            }
        } catch (Throwable) {
            // fallback ниже
        }

        return [$binary, ProductImage::WATERMARK_NEEDS_REVIEW, ['reason' => 'service_unavailable']];
    }

    /**
     * Каталожное фото, галерея и уникализация описания — только для одного product_id (без очереди по каталогу).
     *
     * @return array{success: bool, message: string, steps: array<string, array{ok: bool, error?: string}>}
     */
    public function runSingleProductMediaFollowUp(int $productId, bool $catalog, bool $gallery, bool $descriptions): array
    {
        $steps = [];
        $parts = [];

        if ($catalog) {
            try {
                $this->retryOneCatalogImage($productId);
                $steps['catalog_image'] = ['ok' => true];
                $parts[] = 'Каталожное фото: готово.';
            } catch (Throwable $e) {
                $err = $e->getMessage();
                $steps['catalog_image'] = ['ok' => false, 'error' => $err];
                $parts[] = 'Каталожное фото: '.$err;
            }
        }

        if ($gallery) {
            try {
                $this->retryOneGallery($productId);
                $steps['gallery'] = ['ok' => true];
                $parts[] = 'Галерея: готово.';
            } catch (Throwable $e) {
                $err = $e->getMessage();
                $steps['gallery'] = ['ok' => false, 'error' => $err];
                $parts[] = 'Галерея: '.$err;
            }
        }

        if ($descriptions) {
            try {
                $this->retryOneDescription($productId);
                $steps['description'] = ['ok' => true];
                $parts[] = 'Описание: готово.';
            } catch (Throwable $e) {
                $err = $e->getMessage();
                $steps['description'] = ['ok' => false, 'error' => $err];
                $parts[] = 'Описание: '.$err;
            }
        }

        $allOk = $steps !== [];
        foreach ($steps as $step) {
            if (($step['ok'] ?? false) !== true) {
                $allOk = false;
                break;
            }
        }

        return [
            'success' => $allOk,
            'message' => implode(' ', $parts),
            'steps' => $steps,
        ];
    }

    private function descriptionRewriter(): ProductDescriptionRewriter
    {
        return app(ProductDescriptionRewriter::class);
    }

    private function abortIfStorageWriteError(Throwable $e): void
    {
        if (PublicStorageWriteGuard::isStorageWriteError($e)) {
            throw $e;
        }
    }
}
