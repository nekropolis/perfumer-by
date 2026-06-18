<?php

namespace Modules\Catalog\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Product;

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

        $query->whereHas('activeVariants', function ($variantQuery) use ($minPrice, $maxPrice): void {
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

            if (empty($optionIds)) {
                continue;
            }

            $query->whereHas('attributeValues', function ($valueQuery) use ($attributeId, $optionIds): void {
                $valueQuery
                    ->where('product_attribute_id', $attributeId)
                    ->whereHas('selectedOptions', function ($selectedQuery) use ($optionIds): void {
                        $selectedQuery->whereIn('product_attribute_option_id', $optionIds);
                    });
            });
        }
    }

    /**
     * @param  Builder<Product>  $query
     */
    public static function applyVolumeFilters(Builder $query, Request $request): void
    {
        $keys = collect(explode(',', (string) $request->input('volume', '')))
            ->map(static fn (string $value): string => trim($value))
            ->filter(static fn (string $value): bool => $value !== '')
            ->unique()
            ->values()
            ->all();

        if (empty($keys)) {
            return;
        }

        $selectedBuckets = collect(self::VOLUME_BUCKETS)
            ->filter(static fn (array $bucket): bool => in_array($bucket['key'], $keys, true))
            ->values();

        if ($selectedBuckets->isEmpty()) {
            return;
        }

        $query->whereHas('activeVariants.definition', function ($definitionQuery) use ($selectedBuckets): void {
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
        });
    }
}
