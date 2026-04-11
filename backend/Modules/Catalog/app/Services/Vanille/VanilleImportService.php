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

class VanilleImportService
{
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
        $url = 'https://vanille.by/brendyi';

        try {
            $html = $this->fetchUrl($url, 10);
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'message' => 'Не удалось загрузить страницу брендов: ' . $e->getMessage(),
                'count' => 0,
                'path' => null,
                'log' => [],
            ];
        }

        preg_match_all('/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/isu', $html, $matches, PREG_SET_ORDER);

        $brands = [];

        foreach ($matches as $match) {
            $href = html_entity_decode(trim($match[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');

            $rawName = html_entity_decode($match[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $rawName = preg_replace('/<(small|sup)\b[^>]*>.*?<\/\\1>/isu', '', $rawName);
            $name = trim(strip_tags($rawName));

            if ($name === '') {
                continue;
            }

            $slug = null;
            $vendor = null;
            $sourceUrl = null;
            $publicUrl = null;

            if (str_starts_with($href, '/poisk?') || str_contains($href, 'query=')) {
                $queryString = parse_url($href, PHP_URL_QUERY) ?? '';
                parse_str($queryString, $query);

                $slug = trim((string)($query['query'] ?? ''));
                if (in_array($slug, [
                    'brendyi',
                    'catalog',
                    'shop',
                    'sale',
                    'skidki',
                    'dostavka',
                    'oplata',
                    'o-magazine',
                    'otzyivyi-o-magazine',
                    'akczii-i-novosti',
                ], true)) {
                    continue;
                }
                $vendor = trim((string)($query['vendor'] ?? ''));
                $sourceUrl = str_starts_with($href, 'http')
                    ? $href
                    : 'https://vanille.by' . $href;
                $publicUrl = $slug ? 'https://vanille.by/' . $slug : null;
            } else {
                $path = parse_url($href, PHP_URL_PATH) ?? '';
                $path = trim($path, '/');

                if ($path !== '' && !str_contains($path, '/')) {
                    $slug = $path;
                    $sourceUrl = str_starts_with($href, 'http')
                        ? $href
                        : 'https://vanille.by/' . ltrim($path, '/');
                    $publicUrl = 'https://vanille.by/' . $slug;
                }
            }

            if (!$slug) {
                continue;
            }

            if (mb_strlen($name) > 80) {
                continue;
            }

            if (preg_match('/каталог|магазин|доставка|отзывы|скидки/i', $name)) {
                continue;
            }

            $brands[$slug] = [
                'name' => $name,
                'slug' => $slug,
                'vendor' => $vendor ?: null,
                'url' => $publicUrl,
                'source_url' => $sourceUrl,
            ];
        }

        $brands = array_values($brands);

        $dir = storage_path('app/public/imports/vanille');
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $path = $dir . '/brands.json';

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

    public function collectProductLinks(int $offset = 0, int $limit = 10, ?int $maxLinks = 100): array
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

        $chunk = array_slice($brands, $offset, $limit);
        $processed = count($chunk);

        $path = storage_path('app/public/imports/vanille/product_links.json');

        $existing = [];
        if (file_exists($path)) {
            $existing = json_decode(file_get_contents($path), true);
            if (!is_array($existing)) {
                $existing = [];
            }
        }

        $indexed = [];
        foreach ($existing as $item) {
            if (!empty($item['slug'])) {
                $indexed[$item['slug']] = $item;
            }
        }

        $reachedMaxLinks = false;

        $log = [];

        foreach ($chunk as $brand) {
            $url = $brand['source_url'] ?? ($brand['url'] ?? null);
            $brandName = $brand['name'] ?? 'unknown';

            if (in_array(mb_strtolower(trim($brandName)), ['бренды', 'бренды парфюмерии'], true)) {
                continue;
            }

            if (!$url) {
                continue;
            }

            try {
                $html = $this->fetchUrl($url, 10);
            } catch (\Throwable $e) {
                $log[] = "skip brand: {$brandName} -> " . $e->getMessage();
                continue;
            }

            preg_match_all('/href="([^"]+)"/isu', $html, $matches);

            $found = 0;

            $brandSlug = trim((string)($brand['slug'] ?? ''));
            if (in_array($brandSlug, [
                'brendyi',
                'catalog',
                'shop',
                'sale',
                'skidki',
                'dostavka',
                'oplata',
                'o-magazine',
                'otzyivyi-o-magazine',
                'akczii-i-novosti',
            ], true)) {
                continue;
            }

            foreach ($matches[1] as $href) {
                $href = html_entity_decode(trim($href), ENT_QUOTES | ENT_HTML5, 'UTF-8');

                if ($href === '' || str_starts_with($href, '#')) {
                    continue;
                }

                $href = preg_replace('/#.*$/', '', $href);

                if ($href === '') {
                    continue;
                }

                $fullUrl = str_starts_with($href, 'http://') || str_starts_with($href, 'https://')
                    ? $href
                    : 'https://vanille.by' . (str_starts_with($href, '/') ? $href : '/' . $href);

                $parsedPath = parse_url($fullUrl, PHP_URL_PATH) ?? '';
                $slug = trim($parsedPath, '/');

                if ($slug === '' || str_contains($slug, '/')) {
                    continue;
                }

                if (in_array($slug, [
                    'brendyi',
                    'skidki',
                    'dostavka',
                    'kontaktyi',
                    'otzyivyi-o-magazine',
                    'o-magazine',
                    'akczii-i-novosti',
                    'parfyumeriya-optom',
                    'poryadok-obrabotki-obrashhenij',
                    'parfumeriya-dlya-zhenshhin',
                    'parfumeriya-dlya-muzhchin',
                    'parfumeriya-uniseks',
                    'otlivant-duhi-na-razliv',
                    'ostatki-vo-flakonax',
                    'aroma-box',
                    'poisk',
                    'sale',
                    'shop',
                    'oplata',
                    'catalog',
                    'novinki',
                    'lyuks',
                    'selektivnaya',
                    'lideryi-prodazh',
                    'limited-edition',
                    'celebrity',
                    'klassika',
                    'arabskaya',
                    'top-100-women',
                    'top-100-men',
                    'top-100-unisex',
                    'atomajzeryi',
                    'sertifikat',
                    'podarochnyie-naboryi',
                    'lk',
                    'oformlenie',
                    'izbrannyie',
                    'prosmotrennyie',
                ], true)) {
                    continue;
                }

                if ($slug === $brandSlug) {
                    continue;
                }
                if ($brandSlug !== '' && !str_starts_with($slug, $brandSlug . '-')) {
                    continue;
                }

                $indexed[$slug] = [
                    'slug' => $slug,
                    'url' => 'https://vanille.by/' . $slug,
                    'brand' => $brandName,
                ];

                $found++;

                if ($maxLinks !== null && count($indexed) >= $maxLinks) {
                    $reachedMaxLinks = true;
                    break;
                }
            }

            $log[] = "{$brandName}: {$found}";

            if ($reachedMaxLinks) {
                break;
            }

        }

        $allLinks = array_values($indexed);

        if ($maxLinks !== null) {
            $allLinks = array_slice($allLinks, 0, $maxLinks);
        }

        $dir = storage_path('app/public/imports/vanille');
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        file_put_contents(
            $path,
            json_encode($allLinks, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        $nextOffset = $offset + $processed;
        $done = $reachedMaxLinks || $nextOffset >= count($brands);

        return [
            'success' => true,
            'message' => $done
                ? 'Сбор ссылок завершён'
                : 'Пачка ссылок собрана',
            'count' => count($allLinks),
            'path' => $path,
            'log' => $log,
            'offset' => $offset,
            'limit' => $limit,
            'next_offset' => $nextOffset,
            'done' => $done,
            'max_links' => $maxLinks,
            'reached_max_links' => $reachedMaxLinks,
            'processed_brands' => $processed,
            'total_brands' => count($brands),
        ];
    }

    public function parseProducts(int $offset = 0, int $limit = 20, ?int $maxLinks = 100): array
    {
        $linksPath = storage_path('app/public/imports/vanille/product_links.json');

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
                $items[] = $this->parseProductPage($url);
                $log[] = 'OK: ' . $url;
            } catch (\Throwable $e) {
                $errors++;
                $log[] = 'ERROR: ' . $url . ' -> ' . $e->getMessage();
            }
        }

        $dir = storage_path('app/public/imports/vanille/products');
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

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
            'max_links' => $maxLinks,
            'processed_links' => $processed,
            'total_links' => count($links),
        ];
    }

    protected function parseProductPage(string $url): array
    {
        $html = $this->fetchUrl($url, 10);

        $pageTitle = $this->matchOne('/<title>(.*?)<\/title>/isu', $html);
        $name = $this->matchOne('/<h1[^>]*>(.*?)<\/h1>/isu', $html);

        $characteristics = $this->parseCharacteristics($html);
        $brand = $characteristics['Бренд'] ?? $this->extractBrandFromName($name);
        $description = $this->parseDescription($html);
        $offers = $this->parseOffers($html, $brand, $name);

        return [
            'url' => $url,
            'page_title' => $this->cleanText($pageTitle),
            'brand' => $brand,
            'name' => $this->cleanText($name),
            'characteristics' => $characteristics,
            'description' => $description,
            'offers' => $offers,
        ];
    }

    protected function parseCharacteristics(string $html): array
    {
        $data = [];

        preg_match_all('/<tr[^>]*itemprop="additionalProperty"[^>]*>(.*?)<\/tr>/isu', $html, $rows);

        foreach ($rows[1] as $rowHtml) {
            if (!preg_match('/<span itemprop="name">(.*?)<\/span>/isu', $rowHtml, $keyMatch)) {
                continue;
            }

            $key = $this->cleanText($keyMatch[1]);

            preg_match_all('/<span[^>]*itemprop="value"[^>]*>(.*?)<\/span>/isu', $rowHtml, $valueMatches);
            $values = [];

            foreach ($valueMatches[1] as $rawValue) {
                $value = $this->cleanText($rawValue);
                if ($value !== '') {
                    $values[] = $value;
                }
            }

            if ($key !== '') {
                $data[$key] = implode(', ', $values);
            }
        }

        return $data;
    }

    protected function parseDescription(string $html): string
    {
        if (!preg_match('/<div itemprop="description" class="select">(.*?)<\/div>\s*<!--noindex-->/isu', $html, $match)) {
            return '';
        }

        return $this->cleanText($match[1]);
    }

    protected function parseOffers(string $html, string $brand, string $name): array
    {
        $offers = [];
        $marker = 'itemprop="offers" itemscope itemtype="https://schema.org/Offer"';

        preg_match_all('/' . preg_quote($marker, '/') . '/u', $html, $matches, PREG_OFFSET_CAPTURE);

        $positions = array_map(fn($m) => $m[1], $matches[0]);

        foreach ($positions as $index => $pos) {
            $start = strrpos(substr($html, 0, $pos), '<div');
            $end = $positions[$index + 1] ?? strpos($html, '<div class="product-intro__section">', $pos);

            if ($start === false) {
                $start = $pos;
            }

            if ($end === false) {
                $end = $pos + 3000;
            }

            $block = substr($html, $start, $end - $start);

            preg_match('/<meta itemprop="price" content="([^"]+)"/isu', $block, $priceMatch);

            $inputStart = strpos($block, '<input');
            $attrs = [];

            if ($inputStart !== false) {
                $tag = $this->extractTag($block, $inputStart);
                $attrs = $this->parseAttrs($tag);
            }

            $variant = $attrs['value'] ?? $this->matchOne('/<span class="price-title">(.*?)<\/span>/isu', $block);
            $type = $attrs['data-tip'] ?? $this->matchOne('/<span class="price-tip">(.*?)<\/span>/isu', $block);

            $variant = $this->cleanText($variant);
            $type = $this->cleanText($type);

            if (str_contains(mb_strtolower($variant), 'отливант') || str_contains(mb_strtolower($type), 'отливант')) {
                continue;
            }

            $title = $attrs['data-title'] ?? '';
            $title = $this->cleanText($title);

            if ($title === '') {
                $baseName = $name;
                if ($brand !== '' && str_starts_with(mb_strtolower($name), mb_strtolower($brand . ' '))) {
                    $baseName = trim(mb_substr($name, mb_strlen($brand)));
                }

                $title = trim(implode(' ', array_filter([$brand, $baseName, $variant, $type])));
            }

            $offers[] = [
                'variant' => $variant,
                'type' => $type,
                'title' => $title,
                'article' => $attrs['data-article'] ?? '',
                'price_byn' => $priceMatch[1] ?? $this->cleanText($attrs['data-price'] ?? ''),
                'old_price' => $this->cleanText($attrs['data-oldprice'] ?? ''),
                'stock_flag' => $attrs['data-stock'] ?? '',
                'sale_flag' => $attrs['data-sale'] ?? '',
                'shop_flag' => $attrs['data-shop'] ?? '',
            ];
        }

        return $offers;
    }

    protected function parseAttrs(string $tag): array
    {
        $attrs = [];
        preg_match_all('/([a-zA-Z0-9_:-]+)="([^"]*)"/u', $tag, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $attrs[$match[1]] = $this->cleanText($match[2]);
        }
        return $attrs;
    }

    protected function extractTag(string $html, int $start): string
    {
        $inQuote = false;
        $length = strlen($html);

        for ($i = $start; $i < $length; $i++) {
            $char = $html[$i];

            if ($char === '"') {
                $inQuote = !$inQuote;
            } elseif ($char === '>' && !$inQuote) {
                return substr($html, $start, $i - $start + 1);
            }
        }

        return substr($html, $start);
    }

    protected function matchOne(string $pattern, string $html): string
    {
        return preg_match($pattern, $html, $match) ? $match[1] : '';
    }

    protected function cleanText(string $value): string
    {
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = strip_tags($value);
        $value = preg_replace('/\s+/u', ' ', $value);

        return trim($value);
    }

    protected function extractBrandFromName(string $name): string
    {
        $parts = preg_split('/\s+/u', trim($name));
        return $parts[0] ?? '';
    }

    protected function fetchUrl(string $url, int $timeout = 10): string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => $timeout,
                'header' => implode("\r\n", [
                    'User-Agent: Mozilla/5.0 (compatible; VanilleParser/1.0)',
                    'Accept: text/html,application/xhtml+xml',
                    'Connection: close',
                ]),
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);

        $html = @file_get_contents($url, false, $context);

        if ($html === false) {
            throw new \RuntimeException("Не удалось загрузить URL: {$url}");
        }

        return $html;
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
}
