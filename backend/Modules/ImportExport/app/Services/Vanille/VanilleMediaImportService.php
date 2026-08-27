<?php

namespace Modules\ImportExport\Services\Vanille;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Services\ProductDescriptionRewriter;
use Modules\Catalog\Services\ProductImageVariantService;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Support\ProductImagePathResolver;
use Modules\Catalog\Support\PublicStorageWriteGuard;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleCatalogImageParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleLinkCollector;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;
use Modules\ImportExport\Support\LegacyProductDetector;
use Throwable;

class VanilleMediaImportService
{
    private const int CATALOG_BRANDS_PER_BATCH = 1;

    private const int DESCRIPTION_PRODUCTS_PER_BATCH = 2;

    public function __construct(
        protected VanilleHttpClient $httpClient,
        protected VanilleCatalogImageParser $catalogImageParser,
        protected VanilleLinkCollector $linkCollector,
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
        $imported = 0;
        $skippedExisting = 0;
        $skippedLegacy = 0;
        $skippedNoImage = 0;

        foreach ($chunk as $brand) {
            $url = (string) ($brand['source_url'] ?? $brand['url'] ?? '');
            if ($url === '') {
                continue;
            }

            $supplierProducts = $this->linkedVanilleSupplierProductsForCatalogBrand($brand);
            if ($supplierProducts->isEmpty()) {
                continue;
            }

            $productIds = $supplierProducts->pluck('product_id')->map(fn ($id) => (int) $id)->all();
            $this->legacyDetector->preload($productIds);
            $supplierProducts = $supplierProducts
                ->filter(function (SupplierProduct $supplierProduct) use (&$skippedLegacy): bool {
                    if ($this->legacyDetector->isLegacy((int) $supplierProduct->product_id)) {
                        $skippedLegacy++;

                        return false;
                    }

                    return true;
                })
                ->unique('product_id')
                ->values();
            if ($supplierProducts->isEmpty()) {
                continue;
            }

            $brandSlug = (string) ($brand['slug'] ?? '');
            $needsListing = $supplierProducts->contains(function (SupplierProduct $supplierProduct): bool {
                $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];

                return $this->normalizeListingImageUrls($payload['catalog_image_urls'] ?? []) === [];
            });
            $rows = [];
            if ($needsListing) {
                try {
                    $rows = $this->collectBrandListingRows($url, $brandSlug !== '' ? $brandSlug : null);
                } catch (Throwable $e) {
                    $log[] = 'ERROR brand page: '.$url.' -> '.$e->getMessage();
                }
            }

            foreach ($supplierProducts as $supplierProduct) {
                $productId = (int) $supplierProduct->product_id;
                if ($productId <= 0) {
                    continue;
                }
                if ($this->catalogImagesCountForProduct($productId) > 0) {
                    $skippedExisting++;
                    continue;
                }

                $slug = trim((string) ($supplierProduct->external_slug ?? ''));
                if ($slug === '' && $supplierProduct->external_url) {
                    $slug = trim((string) parse_url((string) $supplierProduct->external_url, PHP_URL_PATH), '/');
                }
                if ($slug === '') {
                    continue;
                }

                $productUrl = trim((string) ($supplierProduct->external_url));
                if ($productUrl === '') {
                    $productUrl = 'https://vanille.by/'.$slug;
                }

                $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
                $imageUrls = $this->normalizeListingImageUrls($payload['catalog_image_urls'] ?? []);
                if ($imageUrls === []) {
                    $imageUrls = $this->resolveCatalogListingImageUrls($slug, $rows, $productUrl);
                }
                if ($imageUrls === []) {
                    $skippedNoImage++;
                    continue;
                }

                try {
                    foreach ($imageUrls as $imgUrl) {
                        $this->storeCatalogImageForProduct($productId, $imgUrl, $slug);
                    }
                    $imported++;
                } catch (Throwable $e) {
                    $this->abortIfStorageWriteError($e);
                    $failed++;
                    $log[] = 'ERROR product '.$productId.' slug='.$slug.' (card fallback) -> '.$e->getMessage();
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
                'imported_count' => $imported,
                'skipped_existing_count' => $skippedExisting,
                'skipped_legacy_count' => $skippedLegacy,
                'skipped_no_image_count' => $skippedNoImage,
                'processed_brands' => min($nextOffset, $totalBrands),
                'total_brands' => $totalBrands,
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
                continue;
            }

            $res = $this->descriptionRewriter()->rewriteProduct($product);
            if (! ($res['ok'] ?? false)) {
                $err = (string) ($res['error'] ?? 'unknown');
                if ($err !== 'legacy_skip' && $err !== 'source_too_short') {
                    $failed++;
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
            } catch (Throwable $e) {
                $failed++;
                $log[] = 'ERROR product '.$pid.': '.$e->getMessage();
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

        $sp->loadMissing('brand');
        $brand = $sp->brand;

        $catalogBrand = null;
        $brandName = trim((string) ($brand?->name ?? ''));
        if ($brandName !== '') {
            $catalogBrand = VanilleBrandParser::findCatalogBrandRow($brandName);
        }

        if ($catalogBrand === null && trim((string) ($brand?->slug ?? '')) !== '') {
            $dbBrandSlug = mb_strtolower(trim((string) $brand->slug));
            foreach (VanilleBrandParser::loadCatalogBrandRows() as $row) {
                if (mb_strtolower(trim((string) ($row['slug'] ?? ''))) === $dbBrandSlug) {
                    $catalogBrand = $row;
                    break;
                }
            }
        }

        $brandUrl = is_array($catalogBrand)
            ? trim((string) ($catalogBrand['source_url'] ?? $catalogBrand['url'] ?? ''))
            : '';
        if ($brandUrl === '') {
            throw new \RuntimeException('Не найден URL бренда в brands.json');
        }

        $brandSlug = trim((string) ($catalogBrand['slug'] ?? ''));
        $rows = $this->collectBrandListingRows($brandUrl, $brandSlug !== '' ? $brandSlug : null);
        $productUrl = trim((string) ($sp->external_url));
        if ($productUrl === '') {
            $productUrl = 'https://vanille.by/'.$slug;
        }
        $listingImageUrls = $this->resolveCatalogListingImageUrls($slug, $rows, $productUrl);
        if ($listingImageUrls === []) {
            throw new \RuntimeException('Каталожное фото не найдено ни в листинге бренда, ни на карточке Vanille для slug='.$slug);
        }

        if ($this->catalogImagesCountForProduct($productId) > 0) {
            return;
        }

        foreach ($listingImageUrls as $listingImageUrl) {
            $this->storeCatalogImageForProduct($productId, $listingImageUrl, $slug);
        }
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
     * Все страницы листинга бренда (msearch2 + product-cut), с дедупликацией по slug.
     *
     * @return list<array{slug:string, image_url:?string}>
     */
    private function collectBrandListingRows(string $brandPageUrl, ?string $brandSlug): array
    {
        $fragments = $this->linkCollector->fetchBrandListingResultHtmlFragments([
            'source_url' => $brandPageUrl,
            'url' => $brandPageUrl,
            'slug' => $brandSlug ?? '',
        ]);

        if ($fragments === []) {
            return [];
        }

        $seen = [];
        $out = [];

        foreach ($fragments as $html) {
            $rows = $this->catalogImageParser->parseListing($html, $brandSlug, false);
            foreach ($rows as $row) {
                $s = trim((string) ($row['slug'] ?? ''));
                if ($s === '' || isset($seen[$s])) {
                    continue;
                }
                $seen[$s] = true;
                $out[] = $row;
            }
        }

        return $out;
    }

    /**
     * @param  list<array{slug:string, image_url:?string, image_urls?:list<string>}>  $listingRows
     * @return list<string>
     */
    private function resolveCatalogListingImageUrls(string $slug, array $listingRows, ?string $productPageUrl = null): array
    {
        $slugLower = mb_strtolower(trim($slug));
        foreach ($listingRows as $row) {
            if (mb_strtolower(trim((string) ($row['slug'] ?? ''))) !== $slugLower) {
                continue;
            }

            $urls = $this->normalizeListingImageUrls($row['image_urls'] ?? [$row['image_url'] ?? null]);
            if ($urls !== []) {
                return $urls;
            }
        }

        $productPageUrl = trim((string) $productPageUrl);
        if ($productPageUrl === '') {
            return [];
        }

        try {
            $html = $this->httpClient->fetchUrl($productPageUrl, 20);
        } catch (Throwable) {
            return [];
        }

        return $this->normalizeListingImageUrls(
            $this->catalogImageParser->parseProductPageCatalogImageUrls($html)
        );
    }

    /**
     * @param  array<string, mixed>  $catalogBrand
     * @return \Illuminate\Support\Collection<int, SupplierProduct>
     */
    private function linkedVanilleSupplierProductsForCatalogBrand(array $catalogBrand): \Illuminate\Support\Collection
    {
        $brandName = trim((string) ($catalogBrand['name'] ?? ''));
        if ($brandName === '') {
            return collect();
        }

        $supplierId = $this->vanilleSupplierId();
        if ($supplierId === 0) {
            return collect();
        }

        $catalogSlug = trim((string) ($catalogBrand['slug'] ?? ''));
        $brandIds = $catalogSlug !== ''
            ? Brand::query()->where('slug', $catalogSlug)->pluck('id')->map(fn ($id) => (int) $id)->all()
            : [];
        if ($brandIds === []) {
            $brandIds = Brand::query()
                ->get(['id', 'name'])
                ->filter(fn (Brand $brand) => ProductDisplayName::brandNamesEquivalent($brandName, (string) $brand->name))
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->filter(fn (int $id) => $id > 0)
                ->values()
                ->all();
        }

        if ($brandIds === []) {
            return collect();
        }

        $query = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->where('is_linked', true)
            ->whereNotNull('product_id')
            ->whereHas('product', fn ($q) => $q->whereIn('brand_id', $brandIds))
            ->whereDoesntHave('product.images', function ($query): void {
                if (self::hasProductImagesExtendedSchema()) {
                    $query->where('usage_type', ProductImage::USAGE_CATALOG);
                } else {
                    $query->where('path', 'like', '%/catalog/%');
                }
            })
            ->whereNotExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('legacy_map_products')
                    ->whereColumn('legacy_map_products.product_id', 'supplier_products.product_id')
                    ->where('legacy_map_products.status', 'matched');
            })
            ->whereNotExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('legacy_unmatched_products')
                    ->whereColumn('legacy_unmatched_products.linked_product_id', 'supplier_products.product_id')
                    ->where('legacy_unmatched_products.status', 'linked');
            });

        return $query
            ->get();
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
    /**
     * Каталожное фото и уникализация описания — только для одного product_id (без очереди по каталогу).
     *
     * @return array{success: bool, message: string, steps: array<string, array{ok: bool, error?: string}>}
     */
    public function runSingleProductMediaFollowUp(int $productId, bool $catalog, bool $descriptions): array
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
