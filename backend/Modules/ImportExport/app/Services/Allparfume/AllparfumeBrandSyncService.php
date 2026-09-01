<?php

namespace Modules\ImportExport\Services\Allparfume;

use GuzzleHttp\Cookie\CookieJar;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Modules\ImportExport\Models\AllparfumeProduct;
use Modules\ImportExport\Models\AllparfumeShopOffer;
use Modules\ImportExport\Models\AllparfumeVariant;
use Modules\ImportExport\Services\Allparfume\Parsers\AllparfumeBrandPageParser;
use Modules\ImportExport\Services\Allparfume\Parsers\AllparfumeBrandsIndexParser;
use Modules\ImportExport\Services\Allparfume\Parsers\AllparfumeProductPageParser;
use Modules\ImportExport\Services\Allparfume\Support\AllparfumeHttpClient;
use Modules\ImportExport\Services\Allparfume\Support\AllparfumeOwnShopFilter;
use Modules\ImportExport\Services\Allparfume\Support\AllparfumeShopRegistry;

class AllparfumeBrandSyncService
{
    /**
     * TEMP: skip already-parsed brands during full site sync. Remove when asked.
     *
     * @var list<string>
     */
    private const TEMP_SKIP_BRAND_SLUGS = [
        'dolce_and_gabbana',
    ];

    public function __construct(
        private readonly AllparfumeHttpClient $httpClient,
        private readonly AllparfumeBrandPageParser $brandPageParser,
        private readonly AllparfumeBrandsIndexParser $brandsIndexParser,
        private readonly AllparfumeProductPageParser $productPageParser,
        private readonly AllparfumeShopRegistry $shopRegistry,
    ) {
    }

    /**
     * @return array{
     *   brand_slug:string,
     *   brand_url:string,
     *   discovered_products:int,
     *   processed_products:int,
     *   created_products:int,
     *   updated_products:int,
     *   created_variants:int,
     *   created_shop_offers:int,
     *   log:list<string>
     * }
     */
    public function syncBrand(string $brandSlug, ?int $limitProducts = null, ?string $brandUrl = null): array
    {
        $brandSlug = trim($brandSlug);
        $brandUrl = $brandUrl !== null && trim($brandUrl) !== ''
            ? trim($brandUrl)
            : $this->httpClient->normalizeUrl("/{$brandSlug}.html");
        $brandHtml = $this->httpClient->fetchUrl($brandUrl, 25);
        $productRows = $this->brandPageParser->parseBrandProducts($brandHtml, $brandSlug);
        if ($limitProducts !== null) {
            $productRows = array_slice($productRows, 0, max(0, $limitProducts));
        }

        $stats = [
            'brand_slug' => $brandSlug,
            'brand_url' => $brandUrl,
            'discovered_products' => count($productRows),
            'processed_products' => 0,
            'created_products' => 0,
            'updated_products' => 0,
            'created_variants' => 0,
            'created_shop_offers' => 0,
            'log' => [],
        ];

        foreach ($productRows as $productRow) {
            $productUrl = $this->httpClient->normalizeUrl($productRow['url']);
            // prices.php requires PHPSESSID from the product page visit.
            $cookieJar = $this->httpClient->createCookieJar();
            $productHtml = $this->httpClient->fetchUrlWithCookieJar($productUrl, $cookieJar, 25)['body'];
            $parsed = $this->productPageParser->parseProductPage($productHtml, $productUrl);
            $offersByVariantKey = $this->fetchOffersByVariantKey($parsed, $productUrl, $cookieJar);

            DB::transaction(function () use (
                &$stats,
                $brandSlug,
                $productRow,
                $productUrl,
                $parsed,
                $offersByVariantKey,
            ): void {
                $sourceUrlHash = sha1($productUrl);
                $product = AllparfumeProduct::query()->where('source_url_hash', $sourceUrlHash)->first();
                $isNewProduct = ! $product instanceof AllparfumeProduct;

                if (! $product instanceof AllparfumeProduct) {
                    $product = new AllparfumeProduct();
                }

                $product->fill([
                    'brand_slug' => $brandSlug,
                    'brand_name' => $parsed['brand_name'] ?: null,
                    'external_slug' => $productRow['external_slug'],
                    'source_url' => $productUrl,
                    'source_url_hash' => $sourceUrlHash,
                    'title' => $parsed['title'],
                    'name' => $parsed['name'] !== '' ? $parsed['name'] : $productRow['title'],
                    'gender_label' => $parsed['gender_label'],
                    'listing_min_price' => $productRow['listing_min_price'],
                    'listing_max_price' => $productRow['listing_max_price'],
                    'last_crawled_at' => now(),
                    'payload' => [
                        'brand_row' => $productRow,
                        'parfume_id' => $parsed['parfume_id'],
                        'volume_cards' => $parsed['volume_cards'],
                    ],
                ]);
                $this->assignParsedExternalId($product, $parsed['parfume_id'] ?? null);
                $product->save();

                $stats[$isNewProduct ? 'created_products' : 'updated_products']++;

                $variantsByKey = $this->mergeVariants($parsed['variants'], $parsed['volume_cards'], $offersByVariantKey);
                $variantIdByKey = [];
                $offersCount = 0;
                $seenVariantKeys = [];

                foreach ($variantsByKey as $variantKey => $variantRow) {
                    $seenVariantKeys[] = $variantKey;
                    $variantOffers = $offersByVariantKey[$variantKey] ?? [];
                    $minFromOffers = $this->minOfferPrice($variantOffers);
                    $minPrice = $variantRow['min_price'] ?? $minFromOffers;

                    $variant = AllparfumeVariant::query()->updateOrCreate(
                        [
                            'allparfume_product_id' => $product->id,
                            'variant_key' => $variantKey,
                        ],
                        [
                            'raw_label' => $variantRow['raw_label'],
                            'volume_ml' => $variantRow['volume_ml'],
                            'concentration_code' => $variantRow['concentration_code'],
                            'is_tester' => $variantRow['is_tester'],
                            'is_vial' => $variantRow['is_vial'],
                            'is_miniature' => $variantRow['is_miniature'],
                            'min_price' => $minPrice,
                            'last_crawled_at' => now(),
                            'payload' => array_merge(
                                is_array($variantRow['payload'] ?? null) ? $variantRow['payload'] : [],
                                [
                                    'offers_count' => count($variantOffers),
                                    'min_price_from_offers' => $minFromOffers,
                                ],
                            ),
                        ],
                    );
                    $variantIdByKey[$variantKey] = (int) $variant->id;
                    $stats['created_variants']++;

                    $seenOfferKeys = [];
                    foreach ($variantOffers as $offerRow) {
                        if (AllparfumeOwnShopFilter::isOwnShop($offerRow)) {
                            continue;
                        }

                        $dedupeKey = $offerRow['shop_key'].'|'.((string) ($offerRow['offer_url_hash'] ?? ''));
                        if (isset($seenOfferKeys[$dedupeKey])) {
                            continue;
                        }
                        $seenOfferKeys[$dedupeKey] = true;

                        if ($this->upsertShopOffer(
                            (int) $product->id,
                            (int) $variant->id,
                            $offerRow,
                        ) === null) {
                            continue;
                        }
                        $offersCount++;
                        $stats['created_shop_offers']++;
                    }
                }

                // Remove variants that disappeared from source (only unlinked ones).
                AllparfumeVariant::query()
                    ->where('allparfume_product_id', $product->id)
                    ->whereNotIn('variant_key', $seenVariantKeys)
                    ->whereNull('product_variant_link_id')
                    ->delete();

                $stats['processed_products']++;
                $stats['log'][] = sprintf(
                    '%s: variants=%d, offers=%d',
                    $product->name ?? $product->external_slug,
                    count($variantIdByKey),
                    $offersCount,
                );
            });
        }

        return $stats;
    }

    /**
     * Refresh prices/offers for already stored products without discovering new brand listings.
     * Preserves product_variant_link_id on variants and include_in_pricing on known offers.
     *
     * @param  callable(array<string,mixed>):void|null  $onProgress
     * @return array<string,int>
     */
    public function refreshExistingProducts(?callable $onProgress = null): array
    {
        $stats = [
            'processed_products' => 0,
            'updated_variants' => 0,
            'created_variants' => 0,
            'updated_offers' => 0,
            'created_offers' => 0,
            'errors' => 0,
        ];

        $total = (int) AllparfumeProduct::query()->count();
        $processed = 0;

        AllparfumeProduct::query()
            ->orderBy('id')
            ->chunkById(50, function ($products) use (&$stats, &$processed, $total, $onProgress): void {
                foreach ($products as $product) {
                    $processed++;
                    try {
                        $this->refreshOneProduct($product, $stats);
                    } catch (\Throwable) {
                        $stats['errors']++;
                    }
                    if ($onProgress !== null) {
                        $progress = $total > 0 ? (int) min(100, max(0, round(($processed / $total) * 100))) : 0;
                        $onProgress([
                            'phase' => 'allparfume_refresh',
                            'processed' => $processed,
                            'total' => $total,
                            'progress' => $progress,
                            'message' => "Allparfume цены: {$processed} / {$total}",
                            'status' => 'running',
                        ]);
                    }
                }
            });

        $stats['processed_products'] = $processed;

        return $stats;
    }

    /**
     * Discover brands from allparfume.by /brands.html (and homepage fallback).
     *
     * @return list<array{brand_slug:string,brand_name:string,brand_url:string}>
     */
    public function discoverSiteBrands(): array
    {
        $html = $this->httpClient->fetchUrl($this->httpClient->normalizeUrl('/brands.html'), 25);
        $rows = $this->brandsIndexParser->parseBrandsIndex($html);
        if ($rows === []) {
            $homeHtml = $this->httpClient->fetchUrl($this->httpClient->normalizeUrl('/'), 25);
            $rows = $this->brandsIndexParser->parseBrandsIndex($homeHtml);
        }

        return $rows;
    }

    /**
     * @return list<string>
     */
    public function discoverSiteBrandSlugs(): array
    {
        return array_values(array_map(
            static fn (array $row): string => (string) $row['brand_slug'],
            $this->discoverSiteBrands(),
        ));
    }

    /**
     * Full site sync: discover all brands on allparfume.by and sync each without product limit.
     * Also includes any brand_slug already stored in DB (union).
     *
     * @param  callable(array<string,mixed>):void|null  $onProgress
     * @return array<string,mixed>
     */
    public function syncAllSiteBrands(?callable $onProgress = null): array
    {
        /** @var array<string,string> $urlBySlug */
        $urlBySlug = [];
        foreach ($this->discoverSiteBrands() as $row) {
            $slug = (string) $row['brand_slug'];
            $urlBySlug[$slug] = (string) $row['brand_url'];
        }
        $discoveredFromSite = count($urlBySlug);

        if ($discoveredFromSite === 0) {
            throw new RuntimeException(
                'Allparfume: с /brands.html не удалось получить список брендов (0). Парсинг остановлен, чтобы не синкать только бренды из БД.',
            );
        }

        $fromDb = AllparfumeProduct::query()
            ->select('brand_slug')
            ->distinct()
            ->orderBy('brand_slug')
            ->pluck('brand_slug')
            ->filter(static fn ($s): bool => is_string($s) && trim($s) !== '')
            ->map(static fn ($s): string => (string) $s)
            ->all();

        foreach ($fromDb as $slug) {
            if (! isset($urlBySlug[$slug])) {
                $urlBySlug[$slug] = $this->httpClient->normalizeUrl("/{$slug}.html");
            }
        }

        $brands = array_keys($urlBySlug);
        $brands = array_values(array_filter(
            $brands,
            static fn (string $slug): bool => ! in_array($slug, self::TEMP_SKIP_BRAND_SLUGS, true),
        ));
        sort($brands);

        if ($brands === []) {
            throw new RuntimeException(
                'Allparfume: нечего парсить — список брендов пуст'
                .(self::TEMP_SKIP_BRAND_SLUGS !== []
                    ? ' (после временного исключения: '.implode(', ', self::TEMP_SKIP_BRAND_SLUGS).')'
                    : '')
                .'. С сайта найдено: '.$discoveredFromSite.'.',
            );
        }

        if ($onProgress !== null) {
            $skipped = implode(', ', self::TEMP_SKIP_BRAND_SLUGS);
            $onProgress([
                'phase' => 'allparfume_full',
                'processed' => 0,
                'total' => count($brands),
                'progress' => 0,
                'message' => 'Allparfume парсинг: найдено брендов с сайта '.$discoveredFromSite
                    .', к обработке '.count($brands)
                    .($skipped !== '' ? " (временно без: {$skipped})" : ''),
                'status' => 'running',
            ]);
        }

        $summary = [
            'brands' => count($brands),
            'discovered_from_site' => $discoveredFromSite,
            'processed_brands' => 0,
            'created_products' => 0,
            'updated_products' => 0,
            'created_variants' => 0,
            'created_shop_offers' => 0,
            'errors' => 0,
            'empty_brands' => 0,
            'error_samples' => [],
        ];

        foreach ($brands as $index => $brandSlug) {
            try {
                $stats = $this->syncBrand(
                    (string) $brandSlug,
                    null,
                    $urlBySlug[$brandSlug] ?? null,
                );
                $discoveredProducts = (int) ($stats['discovered_products'] ?? 0);
                if ($discoveredProducts === 0) {
                    $summary['empty_brands']++;
                    $summary['errors']++;
                    if (count($summary['error_samples']) < 5) {
                        $summary['error_samples'][] = "{$brandSlug}: на странице бренда 0 товаров";
                    }
                } else {
                    $summary['processed_brands']++;
                    $summary['created_products'] += (int) ($stats['created_products'] ?? 0);
                    $summary['updated_products'] += (int) ($stats['updated_products'] ?? 0);
                    $summary['created_variants'] += (int) ($stats['created_variants'] ?? 0);
                    $summary['created_shop_offers'] += (int) ($stats['created_shop_offers'] ?? 0);
                }
            } catch (\Throwable $e) {
                $summary['errors']++;
                if (count($summary['error_samples']) < 5) {
                    $summary['error_samples'][] = "{$brandSlug}: ".$e->getMessage();
                }
            }

            if ($onProgress !== null) {
                $done = $index + 1;
                $progress = count($brands) > 0
                    ? (int) min(100, max(0, round(($done / count($brands)) * 100)))
                    : 100;
                $onProgress([
                    'phase' => 'allparfume_full',
                    'processed' => $done,
                    'total' => count($brands),
                    'progress' => $progress,
                    'message' => "Allparfume парсинг: {$brandSlug} ({$done}/".count($brands)
                        .'), +'.(int) $summary['created_products'].' новых',
                    'status' => 'running',
                ]);
            }
        }

        $saved = (int) $summary['created_products'] + (int) $summary['updated_products'];
        if ($saved === 0) {
            $samples = $summary['error_samples'] !== []
                ? ' Примеры: '.implode('; ', $summary['error_samples'])
                : '';
            throw new RuntimeException(
                'Allparfume: парсинг не сохранил ни одного товара (брендов: '
                .count($brands)
                .', ошибок: '.(int) $summary['errors']
                .', пустых страниц: '.(int) $summary['empty_brands']
                .').'.$samples,
            );
        }

        return $summary;
    }

    /**
     * @param  callable(array<string,mixed>):void|null  $onProgress
     * @return array<string,mixed>
     */
    public function syncAllKnownBrands(?callable $onProgress = null): array
    {
        return $this->syncAllSiteBrands($onProgress);
    }

    /**
     * @param  array<string,int>  $stats
     */
    private function refreshOneProduct(AllparfumeProduct $product, array &$stats): void
    {
        $productUrl = (string) $product->source_url;
        if ($productUrl === '') {
            return;
        }

        $cookieJar = $this->httpClient->createCookieJar();
        $productHtml = $this->httpClient->fetchUrlWithCookieJar($productUrl, $cookieJar, 25)['body'];
        $parsed = $this->productPageParser->parseProductPage($productHtml, $productUrl);
        $offersByVariantKey = $this->fetchOffersByVariantKey($parsed, $productUrl, $cookieJar);
        $variantsByKey = $this->mergeVariants($parsed['variants'], $parsed['volume_cards'], $offersByVariantKey);

        DB::transaction(function () use ($product, $parsed, $offersByVariantKey, $variantsByKey, &$stats): void {
            $product->fill([
                'brand_name' => $parsed['brand_name'] ?: $product->brand_name,
                'title' => $parsed['title'] ?: $product->title,
                'name' => $parsed['name'] !== '' ? $parsed['name'] : $product->name,
                'gender_label' => $parsed['gender_label'] ?: $product->gender_label,
                'last_crawled_at' => now(),
                'payload' => array_merge(
                    is_array($product->payload) ? $product->payload : [],
                    [
                        'parfume_id' => $parsed['parfume_id'],
                        'volume_cards' => $parsed['volume_cards'],
                    ],
                ),
            ]);
            $this->assignParsedExternalId($product, $parsed['parfume_id'] ?? null);
            $product->save();

            foreach ($variantsByKey as $variantKey => $variantRow) {
                $variantOffers = $offersByVariantKey[$variantKey] ?? [];
                $minFromOffers = $this->minOfferPrice($variantOffers);
                $minPrice = $variantRow['min_price'] ?? $minFromOffers;

                $variant = AllparfumeVariant::query()->updateOrCreate(
                    [
                        'allparfume_product_id' => $product->id,
                        'variant_key' => $variantKey,
                    ],
                    [
                        'raw_label' => $variantRow['raw_label'],
                        'volume_ml' => $variantRow['volume_ml'],
                        'concentration_code' => $variantRow['concentration_code'],
                        'is_tester' => $variantRow['is_tester'],
                        'is_vial' => $variantRow['is_vial'],
                        'is_miniature' => $variantRow['is_miniature'],
                        'min_price' => $minPrice,
                        'last_crawled_at' => now(),
                    ],
                );
                if ($variant->wasRecentlyCreated) {
                    $stats['created_variants']++;
                } else {
                    $stats['updated_variants']++;
                }

                $seenKeys = [];
                foreach ($variantOffers as $offerRow) {
                    if (AllparfumeOwnShopFilter::isOwnShop($offerRow)) {
                        continue;
                    }
                    $dedupeKey = $offerRow['shop_key'].'|'.((string) ($offerRow['offer_url_hash'] ?? ''));
                    if (isset($seenKeys[$dedupeKey])) {
                        continue;
                    }
                    $seenKeys[$dedupeKey] = true;

                    $offerResult = $this->upsertShopOffer(
                        (int) $product->id,
                        (int) $variant->id,
                        $offerRow,
                    );
                    if ($offerResult === 'created') {
                        $stats['created_offers']++;
                    } elseif ($offerResult === 'updated') {
                        $stats['updated_offers']++;
                    }
                }
            }
        });
    }

    /**
     * Register shop and upsert offer only when shop is active for pricing/sync.
     *
     * @param  array<string,mixed>  $offerRow
     * @return 'created'|'updated'|null
     */
    private function upsertShopOffer(int $productId, int $variantId, array $offerRow): ?string
    {
        $shop = $this->shopRegistry->ensureFromOffer($offerRow);
        if (! $shop->is_active) {
            return null;
        }

        $existing = AllparfumeShopOffer::query()
            ->where('allparfume_variant_id', $variantId)
            ->where('shop_key', $offerRow['shop_key'])
            ->where('offer_url_hash', $offerRow['offer_url_hash'])
            ->first();

        if ($existing instanceof AllparfumeShopOffer) {
            $existing->update([
                'shop_name' => $offerRow['shop_name'],
                'shop_url' => $offerRow['shop_url'],
                'offer_url' => $offerRow['offer_url'],
                'price' => $offerRow['price'],
                'old_price' => $offerRow['old_price'],
                'delivery_text' => $offerRow['delivery_text'],
                'is_active' => true,
                'include_in_pricing' => true,
                'last_seen_at' => now(),
                'payload' => $offerRow['payload'],
            ]);

            return 'updated';
        }

        AllparfumeShopOffer::query()->create([
            'allparfume_product_id' => $productId,
            'allparfume_variant_id' => $variantId,
            'shop_key' => $offerRow['shop_key'],
            'shop_name' => $offerRow['shop_name'],
            'shop_url' => $offerRow['shop_url'],
            'offer_url' => $offerRow['offer_url'],
            'offer_url_hash' => $offerRow['offer_url_hash'],
            'price' => $offerRow['price'],
            'old_price' => $offerRow['old_price'],
            'delivery_text' => $offerRow['delivery_text'],
            'is_active' => true,
            'include_in_pricing' => true,
            'last_seen_at' => now(),
            'payload' => $offerRow['payload'],
        ]);

        return 'created';
    }

    /**
     * @param  array{
     *   parfume_id:?string,
     *   volume_cards:list<array<string,mixed>>,
     *   variants:list<array<string,mixed>>
     * }  $parsed
     * @return array<string, list<array<string,mixed>>>
     */
    private function fetchOffersByVariantKey(array $parsed, string $productUrl, CookieJar $cookieJar): array
    {
        $parfumeId = trim((string) ($parsed['parfume_id'] ?? ''));
        $volumeCards = is_array($parsed['volume_cards'] ?? null) ? $parsed['volume_cards'] : [];
        if ($parfumeId === '' || $volumeCards === []) {
            return [];
        }

        $offersByVariantKey = [];
        foreach ($volumeCards as $card) {
            $cardClick = trim((string) ($card['card_click'] ?? ''));
            $variantKey = (string) ($card['variant_key'] ?? '');
            if ($cardClick === '' || $variantKey === '') {
                continue;
            }

            $html = $this->httpClient->fetchVariantShopOffersHtml(
                $parfumeId,
                $cardClick,
                $productUrl,
                $cookieJar,
                25,
            );
            if (trim($html) === '') {
                throw new RuntimeException(
                    "prices.php returned empty body for parfume-id={$parfumeId}, card-click={$cardClick}"
                );
            }
            if (str_contains(mb_strtolower($html), 'query failed')) {
                throw new RuntimeException(
                    "prices.php failed for parfume-id={$parfumeId}, card-click={$cardClick}: ".trim(strip_tags($html))
                );
            }

            $offersByVariantKey[$variantKey] = $this->productPageParser->parseShopOffersFromHtml($html, $productUrl);
        }

        return $offersByVariantKey;
    }

    /**
     * @param  list<array<string,mixed>>  $minVariants
     * @param  list<array<string,mixed>>  $volumeCards
     * @param  array<string, list<array<string,mixed>>>  $offersByVariantKey
     * @return array<string, array<string,mixed>>
     */
    private function mergeVariants(array $minVariants, array $volumeCards, array $offersByVariantKey): array
    {
        $result = [];

        foreach ($minVariants as $variantRow) {
            $key = (string) ($variantRow['variant_key'] ?? '');
            if ($key === '') {
                continue;
            }
            $result[$key] = $variantRow;
        }

        foreach ($volumeCards as $card) {
            $key = (string) ($card['variant_key'] ?? '');
            if ($key === '') {
                continue;
            }

            if (! isset($result[$key])) {
                $result[$key] = $this->productPageParser->buildVariantRow(
                    (string) ($card['raw_label'] ?? $card['card_click'] ?? $key),
                    null,
                    [
                        'source' => 'volume_card',
                        'card_click' => $card['card_click'] ?? null,
                    ],
                );
            } else {
                $payload = is_array($result[$key]['payload'] ?? null) ? $result[$key]['payload'] : [];
                $payload['card_click'] = $card['card_click'] ?? null;
                $result[$key]['payload'] = $payload;
            }
        }

        foreach (array_keys($offersByVariantKey) as $key) {
            if (isset($result[$key])) {
                continue;
            }
            $result[$key] = $this->productPageParser->buildVariantRow(
                $key,
                null,
                ['source' => 'offers_only'],
            );
        }

        return $result;
    }

    /**
     * @param  list<array<string,mixed>>  $offers
     */
    private function minOfferPrice(array $offers): ?string
    {
        $min = null;
        foreach ($offers as $offer) {
            $price = $offer['price'] ?? null;
            if ($price === null || ! is_numeric((string) $price)) {
                continue;
            }
            $float = (float) $price;
            if ($min === null || $float < $min) {
                $min = $float;
            }
        }

        return $min === null ? null : number_format($min, 2, '.', '');
    }

    private function assignParsedExternalId(AllparfumeProduct $product, mixed $parfumeId): void
    {
        if ($product->external_id !== null) {
            return;
        }
        if (! is_numeric((string) $parfumeId)) {
            return;
        }
        $id = (int) $parfumeId;
        if ($id <= 0) {
            return;
        }

        $taken = AllparfumeProduct::query()
            ->where('external_id', $id)
            ->when($product->exists, static fn ($q) => $q->where('id', '!=', $product->id))
            ->exists();
        if ($taken) {
            return;
        }

        $product->external_id = $id;
    }
}
