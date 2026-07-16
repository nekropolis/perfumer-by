<?php

namespace Modules\Catalog\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Warehouse\Models\Warehouse;

final class CatalogProductQueryFilters
{
  public const array VOLUME_BUCKETS = [
        ['key' => '1-3', 'label' => '1-3', 'min' => 1, 'max' => 3],
        ['key' => '4-9', 'label' => '4-9', 'min' => 4, 'max' => 9],
        ['key' => '10-25', 'label' => '10-25', 'min' => 10, 'max' => 25],
        ['key' => '25-50', 'label' => '25-50', 'min' => 25, 'max' => 50],
        ['key' => '50-100', 'label' => '50-100', 'min' => 50, 'max' => 100],
        ['key' => '100-200', 'label' => '100-200', 'min' => 100, 'max' => 200],
        ['key' => '200-plus', 'label' => '200+', 'min' => 200, 'max' => null],
    ];

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyListingFilters(Builder $query, Request $request): void
    {
        self::applyBaseFilters($query, $request);
        self::applyAttributeFilters($query, $request);
        self::applyPriceFilters($query, $request);
        self::applyVolumeFilters($query, $request);
        self::applyVariantTypeFilters($query, $request);
    }

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyBaseFilters(Builder $query, Request $request): void
    {
        if ($request->filled('brand')) {
            $brandIds = collect(explode(',', (string) $request->input('brand')))
                ->map(static fn (string $value): int => (int) trim($value))
                ->filter(static fn (int $value): bool => $value > 0)
                ->unique()
                ->values()
                ->all();

            if (!empty($brandIds)) {
                $query->whereIn('brand_id', $brandIds);
            }
        }

        if ($request->filled('brand_slug')) {
            $query->whereHas('brand', function ($brandQuery) use ($request): void {
                $brandQuery->where('slug', $request->string('brand_slug')->toString());
            });
        }

        if ($request->input('new') === '1') {
            $query->where('is_new', true);
        }

        if ($request->input('hit') === '1') {
            $query->where('is_hit', true);
        }
    }

    /**
     * Base catalog filters for query builder on `products` table (facets / aggregations).
     *
     * @param  QueryBuilder  $query
     */
    public static function applyBaseFiltersToQuery(QueryBuilder $query, Request $request): void
    {
        if ($request->filled('brand')) {
            $brandIds = collect(explode(',', (string) $request->input('brand')))
                ->map(static fn (string $value): int => (int) trim($value))
                ->filter(static fn (int $value): bool => $value > 0)
                ->unique()
                ->values()
                ->all();

            if ($brandIds !== []) {
                $query->whereIn('products.brand_id', $brandIds);
            }
        }

        if ($request->filled('brand_slug')) {
            $slug = $request->string('brand_slug')->toString();
            $query->whereExists(function (QueryBuilder $brandQuery) use ($slug): void {
                $brandQuery->selectRaw('1')
                    ->from('brands')
                    ->whereColumn('brands.id', 'products.brand_id')
                    ->where('brands.slug', $slug);
            });
        }

        if ($request->input('new') === '1') {
            $query->where('products.is_new', true);
        }

        if ($request->input('hit') === '1') {
            $query->where('products.is_hit', true);
        }
    }

    /**
     * Active products with at least one active variant (in-stock, preorder, or temporarily OOS).
     *
     * @param  QueryBuilder  $query
     */
    public static function applyCatalogVisibleToQuery(QueryBuilder $query, string $tableAlias = 'products'): void
    {
        $query->where("{$tableAlias}.is_active", true)
            ->whereExists(function (QueryBuilder $variantExists) use ($tableAlias): void {
                $variantExists->selectRaw('1')
                    ->from('product_variant_links as catalog_visible_pvl')
                    ->whereColumn('catalog_visible_pvl.product_id', "{$tableAlias}.id")
                    ->where('catalog_visible_pvl.is_active', true);
            });
    }

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyCatalogListingProductFilter(Builder $query): void
    {
        $query->where('products.is_active', true)
            ->whereHas('variants', function (Builder $variantQuery): void {
                $variantQuery->where('is_active', true);
            });
    }

    /**
     * In stock first, then preorder-only, then temporarily out of stock.
     *
     * @param  Builder<Product>  $query
     */
    public static function applyCatalogListingAvailabilitySort(Builder $query): void
    {
        $warehouseIds = self::listingWarehouseIds();
        $bindings = [];
        $inStockChecks = [];

        if ($warehouseIds !== []) {
            $warehousePlaceholders = implode(',', array_fill(0, count($warehouseIds), '?'));
            $bindings = array_merge($bindings, $warehouseIds);
            $inStockChecks[] = 'EXISTS (
                SELECT 1
                FROM warehouse_variant_stocks AS listing_avail_wvs
                INNER JOIN product_variant_links AS listing_avail_pvl
                    ON listing_avail_pvl.id = listing_avail_wvs.variant_id
                WHERE listing_avail_pvl.product_id = products.id
                    AND listing_avail_pvl.is_preorder = 0
                    AND listing_avail_pvl.is_active = 1
                    AND listing_avail_wvs.warehouse_id IN ('.$warehousePlaceholders.')
                    AND (listing_avail_wvs.stock - COALESCE(listing_avail_wvs.reserved_stock, 0)) > 0
            )';
        }

        $inStockChecks[] = 'EXISTS (
            SELECT 1
            FROM product_variant_links AS listing_avail_pvl
            INNER JOIN supplier_variant_offers AS listing_avail_svo
                ON listing_avail_svo.product_variant_id = listing_avail_pvl.id
            INNER JOIN supplier_products AS listing_avail_sp
                ON listing_avail_sp.supplier_id = listing_avail_svo.supplier_id
                AND listing_avail_sp.product_id = listing_avail_pvl.product_id
            WHERE listing_avail_pvl.product_id = products.id
                AND listing_avail_pvl.is_preorder = 0
                AND listing_avail_pvl.is_active = 1
                AND listing_avail_svo.is_active = 1
                AND listing_avail_sp.is_linked = 1
                AND listing_avail_sp.is_active = 1
                AND listing_avail_sp.link_parsing_active = 1
        )';

        $inStockCondition = '('.implode(' OR ', $inStockChecks).')';

        $query->orderByRaw(
            'CASE
                WHEN products.is_out_of_stock = 1 THEN 2
                WHEN '.$inStockCondition.' THEN 0
                ELSE 1
            END ASC',
            $bindings,
        );
    }

    /**
     * Popular sort: main warehouse → supplier offer/warehouse → preorder → out of stock.
     *
     * @param  Builder<Product>  $query
     */
    public static function applyPopularListingAvailabilitySort(Builder $query): void
    {
        $bindings = [];
        $mainWarehouseId = self::warehouseIdByCode(Warehouse::CODE_MAIN);
        $supplierWarehouseId = self::warehouseIdByCode(Warehouse::CODE_SUPPLIER);

        $mainWarehouseStockSql = '0 = 1';
        if ($mainWarehouseId > 0) {
            $bindings[] = $mainWarehouseId;
            $mainWarehouseStockSql = 'EXISTS (
                SELECT 1
                FROM warehouse_variant_stocks AS pop_main_wvs
                INNER JOIN product_variant_links AS pop_main_pvl
                    ON pop_main_pvl.id = pop_main_wvs.variant_id
                WHERE pop_main_pvl.product_id = products.id
                    AND pop_main_pvl.is_preorder = 0
                    AND pop_main_pvl.is_active = 1
                    AND pop_main_wvs.warehouse_id = ?
                    AND (pop_main_wvs.stock - COALESCE(pop_main_wvs.reserved_stock, 0)) > 0
            )';
        }

        $supplierChecks = [self::productSupplierListingOfferExistsSql()];

        if ($supplierWarehouseId > 0) {
            $bindings[] = $supplierWarehouseId;
            $supplierChecks[] = 'EXISTS (
                SELECT 1
                FROM warehouse_variant_stocks AS pop_sup_wvs
                INNER JOIN product_variant_links AS pop_sup_pvl
                    ON pop_sup_pvl.id = pop_sup_wvs.variant_id
                WHERE pop_sup_pvl.product_id = products.id
                    AND pop_sup_pvl.is_preorder = 0
                    AND pop_sup_pvl.is_active = 1
                    AND pop_sup_wvs.warehouse_id = ?
                    AND (pop_sup_wvs.stock - COALESCE(pop_sup_wvs.reserved_stock, 0)) > 0
            )';
        }

        $supplierInStockSql = '('.implode(' OR ', $supplierChecks).')';

        $preorderSql = 'EXISTS (
            SELECT 1
            FROM product_variant_links AS pop_po_pvl
            WHERE pop_po_pvl.product_id = products.id
                AND pop_po_pvl.is_active = 1
                AND pop_po_pvl.is_preorder = 1
        )';

        $query->orderByRaw(
            'CASE
                WHEN products.is_out_of_stock = 1 THEN 3
                WHEN '.$mainWarehouseStockSql.' THEN 0
                WHEN '.$supplierInStockSql.' THEN 1
                WHEN '.$preorderSql.' THEN 2
                ELSE 3
            END ASC',
            $bindings,
        );
    }

    /**
     * EXISTS: product has an active supplier listing offer (linked supplier product).
     */
    private static function productSupplierListingOfferExistsSql(): string
    {
        return 'EXISTS (
            SELECT 1
            FROM product_variant_links AS pop_offer_pvl
            INNER JOIN supplier_variant_offers AS pop_offer_svo
                ON pop_offer_svo.product_variant_id = pop_offer_pvl.id
            INNER JOIN supplier_products AS pop_offer_sp
                ON pop_offer_sp.supplier_id = pop_offer_svo.supplier_id
                AND pop_offer_sp.product_id = pop_offer_pvl.product_id
            WHERE pop_offer_pvl.product_id = products.id
                AND pop_offer_pvl.is_preorder = 0
                AND pop_offer_pvl.is_active = 1
                AND pop_offer_svo.is_active = 1
                AND pop_offer_sp.is_linked = 1
                AND pop_offer_sp.is_active = 1
                AND pop_offer_sp.link_parsing_active = 1
        )';
    }

    /**
     * @return list<int>
     */
    private static function listingWarehouseIds(): array
    {
        /** @var list<int> $ids */
        $ids = Cache::remember('catalog:warehouse:listing-ids', 3600, static function (): array {
            return Warehouse::query()
                ->whereIn('code', [Warehouse::CODE_MAIN, Warehouse::CODE_SUPPLIER])
                ->pluck('id')
                ->map(static fn ($id): int => (int) $id)
                ->filter(static fn (int $id): bool => $id > 0)
                ->values()
                ->all();
        });

        return $ids;
    }

    private static function warehouseIdByCode(string $code): int
    {
        /** @var array<string, int> $cache */
        static $cache = [];

        if (!array_key_exists($code, $cache)) {
            $cache[$code] = (int) Warehouse::query()->where('code', $code)->value('id');
        }

        return $cache[$code];
    }

    /**
     * @param  QueryBuilder  $query
     */
    public static function applyCatalogVisibleProductExists(
        QueryBuilder $query,
        Request $request,
        string $productIdColumn,
    ): void {
        $query->whereExists(function (QueryBuilder $productQuery) use ($request, $productIdColumn): void {
            $productQuery->selectRaw('1')
                ->from('products')
                ->whereColumn('products.id', $productIdColumn);

            self::applyCatalogVisibleToQuery($productQuery);
            self::applyBaseFiltersToQuery($productQuery, $request);
        });
    }

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyPriceFilters(Builder $query, Request $request): void
    {
        $minPrice = $request->filled('price_min') ? (float) $request->input('price_min') : null;
        $maxPrice = $request->filled('price_max') ? (float) $request->input('price_max') : null;

        if ($minPrice === null && $maxPrice === null) {
            return;
        }

        $query->whereHas('variants', function (Builder $variantQuery) use ($minPrice, $maxPrice): void {
            CatalogVariantStockPresenter::applyStorefrontInStockScope($variantQuery);
            $variantQuery->whereNotNull('price');

            if ($minPrice !== null) {
                $variantQuery->where('price', '>=', $minPrice);
            }

            if ($maxPrice !== null) {
                $variantQuery->where('price', '<=', $maxPrice);
            }
        });
    }

    /**
     * Query params that affect facet counts in CatalogFiltersService (base filters only).
     *
     * @return array<string, mixed>
     */
    public static function facetCacheQueryParams(Request $request): array
    {
        $params = [];

        foreach (['brand', 'brand_slug', 'new', 'hit'] as $key) {
            if (!$request->filled($key)) {
                continue;
            }

            $params[$key] = $request->input($key);
        }

        return $params;
    }

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyAttributeFilters(Builder $query, Request $request): void
    {
        $attributeFilters = collect($request->query())
            ->filter(function ($value, $key): bool {
                return is_string($key) && str_starts_with($key, 'attr_');
            });

        foreach ($attributeFilters as $key => $rawValue) {
            $attributeId = (int) str_replace('attr_', '', (string) $key);
            if ($attributeId <= 0) {
                continue;
            }

            $optionIds = collect(explode(',', (string) $rawValue))
                ->map(static fn (string $id): int => (int) trim($id))
                ->filter(static fn (int $id): bool => $id > 0)
                ->unique()
                ->values()
                ->all();

            if ($optionIds === []) {
                continue;
            }

            $query->whereExists(function ($subQuery) use ($attributeId, $optionIds): void {
                $subQuery->selectRaw('1')
                    ->from('product_attribute_values as pav')
                    ->join(
                        'product_attribute_value_options as pavo',
                        'pavo.product_attribute_value_id',
                        '=',
                        'pav.id'
                    )
                    ->whereColumn('pav.product_id', 'products.id')
                    ->where('pav.product_attribute_id', $attributeId)
                    ->whereIn('pavo.product_attribute_option_id', $optionIds);
            });
        }
    }

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyVolumeFilters(Builder $query, Request $request): void
    {
        $keys = self::resolveVolumeFilterKeys($request);

        if (empty($keys)) {
            return;
        }

        $selectedBuckets = collect(self::VOLUME_BUCKETS)
            ->filter(static fn (array $bucket): bool => in_array($bucket['key'], $keys, true))
            ->values();

        if ($selectedBuckets->isEmpty()) {
            return;
        }

        $query->whereHas('variants', function (Builder $variantQuery) use ($selectedBuckets): void {
            CatalogVariantStockPresenter::applyStorefrontInStockScope($variantQuery);
            $variantQuery->whereHas('definition', function ($definitionQuery) use ($selectedBuckets): void {
                self::applyVolumeBucketConstraints($definitionQuery, $selectedBuckets);
            });
        });
    }

    /**
     * Filter products that have an in-stock variant marked as tester and/or miniature.
     * When both flags are set, match either (OR).
     *
     * @param  Builder<Product>  $query
     */
    public static function applyVariantTypeFilters(Builder $query, Request $request): void
    {
        if ($request->input('tester') !== '1' && $request->input('miniature') !== '1') {
            return;
        }

        $query->whereHas('variants', function (Builder $variantQuery) use ($request): void {
            CatalogVariantStockPresenter::applyStorefrontInStockScope($variantQuery);
            self::applyVariantTypeFlagFilters($variantQuery, $request);
        });
    }

    /**
     * @param  Builder<ProductVariantLink>  $query
     */
    public static function applyVariantPriceFilters(Builder $query, Request $request): void
    {
        $minPrice = $request->filled('price_min') ? (float) $request->input('price_min') : null;
        $maxPrice = $request->filled('price_max') ? (float) $request->input('price_max') : null;

        if ($minPrice === null && $maxPrice === null) {
            return;
        }

        $query->whereNotNull('price');

        if ($minPrice !== null) {
            $query->where('price', '>=', $minPrice);
        }

        if ($maxPrice !== null) {
            $query->where('price', '<=', $maxPrice);
        }
    }

    /**
     * @param  Builder<ProductVariantLink>  $query
     */
    public static function applyVariantVolumeFilters(Builder $query, Request $request): void
    {
        $keys = self::resolveVolumeFilterKeys($request);

        if (empty($keys)) {
            return;
        }

        $selectedBuckets = collect(self::VOLUME_BUCKETS)
            ->filter(static fn (array $bucket): bool => in_array($bucket['key'], $keys, true))
            ->values();

        if ($selectedBuckets->isEmpty()) {
            return;
        }

        $query->whereHas('definition', function ($definitionQuery) use ($selectedBuckets): void {
            self::applyVolumeBucketConstraints($definitionQuery, $selectedBuckets);
        });
    }

    /**
     * @param  Builder<ProductVariantLink>  $query
     */
    public static function applyVariantTypeFlagFilters(Builder $query, Request $request): void
    {
        $wantTester = $request->input('tester') === '1';
        $wantMiniature = $request->input('miniature') === '1';

        if (!$wantTester && !$wantMiniature) {
            return;
        }

        $query->whereHas('definition', function ($definitionQuery) use ($wantTester, $wantMiniature): void {
            if ($wantTester && $wantMiniature) {
                $definitionQuery->where(function ($typeQuery): void {
                    $typeQuery->where('is_tester', true)
                        ->orWhere('is_miniature', true);
                });

                return;
            }

            if ($wantTester) {
                $definitionQuery->where('is_tester', true);
            }

            if ($wantMiniature) {
                $definitionQuery->where('is_miniature', true);
            }
        });
    }

    /**
     * @return list<string>
     */
    private static function resolveVolumeFilterKeys(Request $request): array
    {
        return collect(explode(',', (string) $request->input('volume', '')))
            ->map(static fn (string $value): string => trim($value))
            ->filter(static fn (string $value): bool => $value !== '')
            ->unique()
            ->values()
            ->all();
    }

  /**
     * @param  Builder<\Modules\Catalog\Models\VariantDefinition>  $definitionQuery
     * @param  \Illuminate\Support\Collection<int, array{key: string, label: string, min: int, max: int|null}>  $selectedBuckets
     */
    private static function applyVolumeBucketConstraints(Builder $definitionQuery, $selectedBuckets): void
    {
        $definitionQuery->where(function ($rangeQuery) use ($selectedBuckets): void {
            foreach ($selectedBuckets as $bucket) {
                $rangeQuery->orWhere(function ($bucketQuery) use ($bucket): void {
                    $min = (int) ($bucket['min'] ?? 0);
                    $max = $bucket['max'];
                    $bucketQuery->whereNotNull('volume_ml')
                        ->where('volume_ml', '>=', $min);
                    if ($max !== null) {
                        $bucketQuery->where('volume_ml', '<=', (int) $max);
                    }
                });
            }
        });
    }
}
