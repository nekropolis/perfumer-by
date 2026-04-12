<?php

namespace Modules\Catalog\Services\Vanille;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Services\Vanille\Parsers\VanilleBrandParser;
use Modules\Catalog\Services\Vanille\Parsers\VanilleLinkCollector;
use Modules\Catalog\Services\Vanille\Parsers\VanilleProductParser;
use Modules\Catalog\Services\Vanille\Support\VanilleHttpClient;

class VanilleImportService
{
    public function __construct(
        protected VanilleHttpClient $httpClient,
        protected VanilleProductParser $productParser,
        protected VanilleBrandParser $brandParser,
        protected VanilleLinkCollector $linkCollector,
    ) {
    }

    public function importFromJsonFile(string $path): array
    {
        if (!file_exists($path)) {
            return [
                'success' => false,
                'message' => "Файл не найден: {$path}",
                'imported' => 0,
                'updated' => 0,
                'errors' => 1,
                'items' => 0,
                'log' => [],
            ];
        }

        $json = file_get_contents($path);
        $items = json_decode($json, true);

        if (!is_array($items)) {
            return [
                'success' => false,
                'message' => 'Некорректный JSON',
                'imported' => 0,
                'updated' => 0,
                'errors' => 1,
                'items' => 0,
                'log' => [],
            ];
        }

        $supplier = Supplier::firstOrCreate(
            ['code' => 'vanille'],
            [
                'name' => 'Vanille',
                'base_url' => 'https://vanille.by',
                'is_active' => true,
            ]
        );

        $imported = 0;
        $updated = 0;
        $errors = 0;
        $log = [];

        foreach ($items as $item) {
            try {
                DB::transaction(function () use ($item, $supplier, &$imported, &$updated, &$log) {
                    $brand = null;

                    if (!empty($item['brand'])) {
                        $brand = Brand::firstOrCreate(
                            ['slug' => Str::slug($item['brand'])],
                            [
                                'name' => $item['brand'],
                                'seo_title' => $item['brand'],
                                'seo_description' => null,
                                'description' => null,
                                'is_active' => true,
                            ]
                        );
                    }

                    $slug = Str::slug($item['name']);
                    $existingProduct = Product::where('slug', $slug)->first();

                    $product = Product::updateOrCreate(
                        ['slug' => $slug],
                        [
                            'brand_id' => $brand?->id,
                            'main_category_id' => null,
                            'name' => $item['name'],
                            'h1' => $item['name'],
                            'short_description' => mb_substr(trim(strip_tags($item['description'] ?? '')), 0, 1000),
                            'description' => $item['description'] ?? null,
                            'seo_title' => mb_substr(trim($item['page_title'] ?? $item['name'] ?? ''), 0, 255),
                            'seo_description' => mb_substr(trim(strip_tags($item['description'] ?? '')), 0, 500),
                            'is_active' => true,
                            'is_new' => false,
                            'is_hit' => false,
                            'sort_order' => 0,
                        ]
                    );

                    SupplierProduct::updateOrCreate(
                        [
                            'supplier_id' => $supplier->id,
                            'external_url' => $item['url'] ?? null,
                        ],
                        [
                            'brand_id' => $brand?->id,
                            'product_id' => $product->id,
                            'external_name' => $item['name'] ?? '',
                            'external_slug' => Str::slug($item['name'] ?? ''),
                            'is_linked' => true,
                            'is_active' => true,
                            'last_seen_at' => now(),
                            'payload' => $item,
                        ]
                    );


                    if ($existingProduct) {
                        $updated++;
                    } else {
                        $imported++;
                    }

                    ProductAttribute::where('product_id', $product->id)->delete();

                    $sort = 0;
                    foreach (($item['characteristics'] ?? []) as $name => $value) {
                        ProductAttribute::create([
                            'product_id' => $product->id,
                            'name' => $name,
                            'value' => $value,
                            'sort_order' => $sort++,
                        ]);
                    }

                    foreach (($item['offers'] ?? []) as $index => $offer) {
                        $parsed = $this->parseVariant($offer);

                        $variant = ProductVariant::updateOrCreate(
                            [
                                'product_id' => $product->id,
                                'title' => $offer['title'],
                            ],
                            [
                                'volume' => $parsed['volume'],
                                'volume_unit' => $parsed['volume_unit'],
                                'type' => $offer['type'] ?? null,
                                'concentration' => $parsed['concentration'],
                                'edition' => $parsed['edition'],
                                'price' => $this->normalizePrice($offer['price_byn'] ?? null),
                                'old_price' => $this->normalizePrice($offer['old_price'] ?? null),
                                'stock' => $this->normalizeStock($offer['stock_flag'] ?? null),
                                'is_preorder' => false,
                                'is_active' => true,
                                'sort_order' => $index,
                            ]
                        );
                        SupplierVariantOffer::updateOrCreate(
                            [
                                'supplier_id' => $supplier->id,
                                'product_variant_id' => $variant->id,
                                'external_id' => $offer['article'] ?? null,
                            ],
                            [
                                'external_product_url' => $item['url'] ?? null,
                                'external_product_name' => $item['name'] ?? null,
                                'external_variant_name' => $offer['variant'] ?? null,
                                'sku' => null,
                                'price' => $this->normalizePrice($offer['price_byn'] ?? null),
                                'old_price' => $this->normalizePrice($offer['old_price'] ?? null),
                                'purchase_price' => null,
                                'stock' => $this->normalizeStock($offer['stock_flag'] ?? null),
                                'is_preorder' => false,
                                'is_active' => true,
                                'last_seen_at' => now(),
                                'last_synced_at' => now(),
                                'payload' => $offer,
                            ]
                        );
                    }

                    $this->refreshVariantAggregates($product);

                    $log[] = 'OK: ' . ($item['name'] ?? 'unknown');
                });
            } catch (\Throwable $e) {
                $errors++;
                $log[] = 'ERROR: ' . ($item['name'] ?? 'unknown') . ' -> ' . $e->getMessage();
            }
        }

        return [
            'success' => $errors === 0,
            'message' => $errors === 0 ? 'Импорт завершён' : 'Импорт завершён с ошибками',
            'imported' => $imported,
            'updated' => $updated,
            'errors' => $errors,
            'items' => count($items),
            'log' => $log,
        ];
    }

    protected function parseVariant(array $offer): array
    {
        $variant = $offer['variant'] ?? '';
        $title = $offer['title'] ?? '';

        $volume = null;
        $volumeUnit = null;

        if (preg_match('/(\d+)\s*(мл|ml)/iu', $variant, $m)) {
            $volume = (int)$m[1];
            $volumeUnit = 'ml';
        }

        $edition = null;
        if (Str::contains(mb_strtolower($variant), 'тестер') || Str::contains(mb_strtolower($title), 'tester')) {
            $edition = 'tester';
        }

        $concentration = null;
        $titleLower = mb_strtolower($title);

        if (str_contains($titleLower, ' parfum')) {
            $concentration = 'parfum';
        } elseif (str_contains($titleLower, ' edp')) {
            $concentration = 'edp';
        } elseif (str_contains($titleLower, ' edt')) {
            $concentration = 'edt';
        }

        return [
            'volume' => $volume,
            'volume_unit' => $volumeUnit,
            'concentration' => $concentration,
            'edition' => $edition,
        ];
    }

    protected function normalizePrice($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $value = strip_tags((string)$value);
        $value = str_replace(['BYN', ' '], '', $value);
        $value = str_replace(',', '.', $value);

        return is_numeric($value) ? number_format((float)$value, 2, '.', '') : null;
    }

    protected function normalizeStock($value): int
    {
        if ($value === null || $value === '') {
            return 0;
        }

        return (int)$value;
    }

    protected function refreshVariantAggregates(Product $product): void
    {
        $product->load('variants.supplierOffers');

        foreach ($product->variants as $variant) {
            $offers = $variant->supplierOffers
                ->where('is_active', true)
                ->sortBy('price')
                ->values();

            if ($offers->isEmpty()) {
                $variant->update([
                    'price' => null,
                    'old_price' => null,
                    'stock' => 0,
                    'is_active' => false,
                ]);
                continue;
            }

            $bestOffer = $offers->first();

            $variant->update([
                'price' => $bestOffer->price,
                'old_price' => $bestOffer->old_price,
                'stock' => (int)$offers->max('stock'),
                'is_active' => true,
                'is_preorder' => (bool)$offers->every(fn($offer) => $offer->is_preorder),
            ]);
        }
    }

    public function parseBrands(): array
    {
        try {
            $brands = $this->brandParser->parse();
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'message' => 'Не удалось загрузить страницу брендов: ' . $e->getMessage(),
                'count' => 0,
                'path' => null,
                'log' => [],
            ];
        }

        $path = $this->ensureVanilleImportDir() . '/brands.json';

        file_put_contents(
            $path,
            json_encode($brands, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        return [
            'success' => true,
            'message' => 'Бренды успешно спарсены',
            'count' => count($brands),
            'path' => $path,
            'log' => [
                'brands parsed: ' . count($brands),
                'saved to: ' . $path,
            ],
        ];
    }

    public function collectProductLinks(int $offset = 0, int $limit = 100, ?int $maxLinks = 100): array
    {
        $brandsPath = storage_path('app/public/imports/vanille/brands.json');

        if (!file_exists($brandsPath)) {
            return [
                'success' => false,
                'message' => 'Сначала выполните парсинг брендов',
                'count' => 0,
                'path' => null,
                'log' => [],
                'offset' => $offset,
                'limit' => $limit,
                'done' => true,
            ];
        }

        $brands = json_decode(file_get_contents($brandsPath), true);

        if (!is_array($brands)) {
            return [
                'success' => false,
                'message' => 'Файл brands.json повреждён',
                'count' => 0,
                'path' => null,
                'log' => [],
                'offset' => $offset,
                'limit' => $limit,
                'done' => true,
            ];
        }

        $result = $this->linkCollector->collect($brands, $offset, $limit, $maxLinks);

        $path = $this->ensureVanilleImportDir() . '/product_links.json';

        file_put_contents(
            $path,
            json_encode($result['links'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        return [
            'success' => true,
            'message' => $result['done']
                ? 'Сбор ссылок завершён'
                : 'Пачка ссылок собрана',
            'count' => count($result['links']),
            'path' => $path,
            'log' => $result['log'],
            'offset' => $result['offset'],
            'limit' => $result['limit'],
            'next_offset' => $result['next_offset'],
            'done' => $result['done'],
            'processed_brands' => $result['processed_brands'],
            'total_brands' => $result['total_brands'],
            'max_links' => $result['max_links'],
            'reached_max_links' => $result['reached_max_links'],
        ];
    }

    public function parseProducts(int $offset = 0, int $limit = 20, ?int $maxLinks = 100): array
    {
        $linksPath = $this->ensureVanilleImportDir() . '/product_links.json';

        if (!file_exists($linksPath)) {
            return [
                'success' => false,
                'message' => 'Сначала выполните сбор ссылок товаров',
                'count' => 0,
                'errors' => 0,
                'files' => [],
                'log' => [],
                'done' => true,
                'offset' => $offset,
                'limit' => $limit,
            ];
        }

        $links = json_decode(file_get_contents($linksPath), true);

        if (!is_array($links)) {
            return [
                'success' => false,
                'message' => 'Файл product_links.json повреждён',
                'count' => 0,
                'errors' => 0,
                'files' => [],
                'log' => [],
                'done' => true,
                'offset' => $offset,
                'limit' => $limit,
            ];
        }

        if ($maxLinks !== null) {
            $links = array_slice($links, 0, $maxLinks);
        }

        $chunk = array_slice($links, $offset, $limit);
        $processed = count($chunk);

        $items = [];
        $log = [];
        $errors = 0;

        foreach ($chunk as $link) {
            $url = $link['url'] ?? null;

            if (!$url) {
                continue;
            }

            try {
                $items[] = $this->productParser->parseProductPage($url);
                $log[] = 'OK: ' . $url;
            } catch (\Throwable $e) {
                $errors++;
                $log[] = 'ERROR: ' . $url . ' -> ' . $e->getMessage();
            }
        }

        $dir = $this->ensureVanilleProductsDir();

        $fileIndex = (int) floor($offset / $limit) + 1;
        $filePath = $dir . '/products_' . str_pad((string) $fileIndex, 3, '0', STR_PAD_LEFT) . '.json';

        file_put_contents(
            $filePath,
            json_encode($items, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        $nextOffset = $offset + $processed;
        $done = $nextOffset >= count($links);

        $files = glob($dir . '/products_*.json') ?: [];
        sort($files);

        return [
            'success' => $errors === 0,
            'message' => $done
                ? 'Массовый парсинг карточек завершён'
                : 'Пачка карточек спарсена',
            'count' => count($items),
            'errors' => $errors,
            'files' => array_values($files),
            'last_file' => $filePath,
            'log' => $log,
            'offset' => $offset,
            'limit' => $limit,
            'next_offset' => $nextOffset,
            'done' => $done,
            'processed_links' => $processed,
            'total_links' => count($links),
            'max_links' => $maxLinks,
        ];
    }


    public function importParsedProducts(): array
    {
        $dir = storage_path('app/public/imports/vanille/products');
        $files = glob($dir . '/products_*.json') ?: [];
        sort($files);

        if (empty($files)) {
            return [
                'success' => false,
                'message' => 'Файлы products_*.json не найдены',
                'imported' => 0,
                'updated' => 0,
                'errors' => 1,
                'items' => 0,
                'files' => [],
                'log' => [],
            ];
        }

        $totalImported = 0;
        $totalUpdated = 0;
        $totalErrors = 0;
        $totalItems = 0;
        $log = [];

        foreach ($files as $file) {
            $result = $this->importFromJsonFile($file);

            $totalImported += (int) ($result['imported'] ?? 0);
            $totalUpdated += (int) ($result['updated'] ?? 0);
            $totalErrors += (int) ($result['errors'] ?? 0);
            $totalItems += (int) ($result['items'] ?? 0);

            $log[] = 'FILE: ' . basename($file);
            foreach (($result['log'] ?? []) as $line) {
                $log[] = $line;
            }
        }

        return [
            'success' => $totalErrors === 0,
            'message' => $totalErrors === 0
                ? 'Импорт спарсенных товаров завершён'
                : 'Импорт спарсенных товаров завершён с ошибками',
            'imported' => $totalImported,
            'updated' => $totalUpdated,
            'errors' => $totalErrors,
            'items' => $totalItems,
            'files' => array_values($files),
            'log' => $log,
        ];
    }

    protected function ensureVanilleImportDir(): string
    {
        $dir = storage_path('app/public/imports/vanille');

        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        return $dir;
    }

    protected function ensureVanilleProductsDir(): string
    {
        $dir = storage_path('app/public/imports/vanille/products');

        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        return $dir;
    }
}
