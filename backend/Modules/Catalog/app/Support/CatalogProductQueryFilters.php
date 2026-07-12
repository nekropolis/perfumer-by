<?php

namespace Modules\Catalog\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

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
     * Products with at least one in-stock variant (warehouse or supplier offer).
     *
     * @param  QueryBuilder  $query
     */
    public static function applyCatalogVisibleToQuery(QueryBuilder $query, string $tableAlias = 'products'): void
    {
        $query->where("{$tableAlias}.is_active", true)
            ->whereExists(function (QueryBuilder $variantExists) use ($tableAlias): void {
                $variantExists->selectRaw('1')
                    ->from('product_variant_links as catalog_in_stock_pvl')
                    ->whereColumn('catalog_in_stock_pvl.product_id', "{$tableAlias}.id");

                CatalogVariantStockPresenter::applyStorefrontInStockToVariantQueryForFacets(
                    $variantExists,
                    'catalog_in_stock_pvl',
                );
            });
    }

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyCatalogListingProductFilter(Builder $query): void
    {
        $query->where('products.is_active', true)
            ->whereHas('variants', function (Builder $variantQuery): void {
                CatalogVariantStockPresenter::applyStorefrontInStockScope($variantQuery);
            });
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
