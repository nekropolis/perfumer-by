<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogProductQueryFilters;

class CatalogFiltersService
{
    private const array VOLUME_BUCKETS = [
        ['key' => '1-3', 'label' => '1-3', 'min' => 1, 'max' => 3],
        ['key' => '4-9', 'label' => '4-9', 'min' => 4, 'max' => 9],
        ['key' => '10-25', 'label' => '10-25', 'min' => 10, 'max' => 25],
        ['key' => '25-50', 'label' => '25-50', 'min' => 25, 'max' => 50],
        ['key' => '50-100', 'label' => '50-100', 'min' => 50, 'max' => 100],
        ['key' => '100-200', 'label' => '100-200', 'min' => 100, 'max' => 200],
        ['key' => '200-plus', 'label' => '200+', 'min' => 200, 'max' => null],
    ];

    /**
     * @return array{data: array{price: array{min: float|null, max: float|null}, volume: list<array<string, mixed>>, attributes: list<array<string, mixed>>}}
     */
    public function build(Request $request): array
    {
        $baseQuery = Product::query()->where('is_active', true);
        CatalogProductQueryFilters::applyBaseFilters($baseQuery, $request);

        $priceBounds = $this->resolvePriceBounds($baseQuery);
        $attributes = $this->loadFilterableAttributes();
        $optionCounts = $this->resolveAttributeOptionCounts($baseQuery, $attributes);
        $volumePayload = $this->resolveVolumeFacetCounts($baseQuery);

        $attributePayload = $attributes
            ->map(function (ProductAttribute $attribute) use ($optionCounts): array {
                $countsForAttribute = $optionCounts->get((int) $attribute->id, collect());

                $options = $attribute->activeOptions
                    ->map(function ($option) use ($countsForAttribute): array {
                        return [
                            'id' => (int) $option->id,
                            'name' => (string) $option->name,
                            'sort_order' => (int) $option->sort_order,
                            'products_count' => (int) ($countsForAttribute->get((int) $option->id, 0)),
                        ];
                    })
                    ->values()
                    ->all();

                return [
                    'id' => (int) $attribute->id,
                    'name' => (string) $attribute->name,
                    'type' => (string) $attribute->type,
                    'sort_order' => (int) $attribute->filter_sort_order,
                    'options' => $options,
                ];
            })
            ->values()
            ->all();

        return [
            'data' => [
                'price' => $priceBounds,
                'volume' => $volumePayload,
                'attributes' => $attributePayload,
            ],
        ];
    }

    /**
     * @param  Builder<Product>  $baseQuery
     * @return array{min: float|null, max: float|null}
     */
    private function resolvePriceBounds(Builder $baseQuery): array
    {
        $row = (clone $baseQuery)
            ->selectRaw('MIN(listing_min_price) as price_min, MAX(listing_max_price) as price_max')
            ->first();

        return [
            'min' => $row?->price_min !== null ? (float) $row->price_min : null,
            'max' => $row?->price_max !== null ? (float) $row->price_max : null,
        ];
    }

    /**
     * @return Collection<int, ProductAttribute>
     */
    private function loadFilterableAttributes(): Collection
    {
        return ProductAttribute::query()
            ->where('is_active', true)
            ->where('is_filterable', true)
            ->with(['activeOptions' => function ($q): void {
                $q->select('id', 'product_attribute_id', 'name', 'sort_order')
                    ->orderBy('sort_order')
                    ->orderBy('name');
            }])
            ->orderBy('filter_sort_order')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * @param  Builder<Product>  $baseQuery
     * @param  Collection<int, ProductAttribute>  $attributes
     * @return Collection<int, Collection<int, int>> attribute_id => (option_id => products_count)
     */
    private function resolveAttributeOptionCounts(Builder $baseQuery, Collection $attributes): Collection
    {
        $attributeIds = $attributes
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->values()
            ->all();

        if ($attributeIds === []) {
            return collect();
        }

        $rows = DB::table('products')
            ->join('product_attribute_values as pav', 'pav.product_id', '=', 'products.id')
            ->join('product_attribute_value_options as pavo', 'pavo.product_attribute_value_id', '=', 'pav.id')
            ->whereIn('products.id', (clone $baseQuery)->select('products.id'))
            ->whereIn('pav.product_attribute_id', $attributeIds)
            ->groupBy('pav.product_attribute_id', 'pavo.product_attribute_option_id')
            ->selectRaw('pav.product_attribute_id as attribute_id')
            ->selectRaw('pavo.product_attribute_option_id as option_id')
            ->selectRaw('COUNT(DISTINCT products.id) as products_count')
            ->get();

        return $rows->groupBy(static fn ($row): int => (int) $row->attribute_id)
            ->map(static function (Collection $attributeRows): Collection {
                return $attributeRows->mapWithKeys(static fn ($row): array => [
                    (int) $row->option_id => (int) $row->products_count,
                ]);
            });
    }

    /**
     * @param  Builder<Product>  $baseQuery
     * @return list<array{key: string, label: string, products_count: int}>
     */
    private function resolveVolumeFacetCounts(Builder $baseQuery): array
    {
        $filteredProductIds = (clone $baseQuery)->select('products.id');

        $variantVolumeQuery = ProductVariantLink::query()
            ->catalogListingEligible()
            ->join('variant_definitions as vd', 'vd.id', '=', 'product_variant_links.variant_definition_id')
            ->whereNotNull('vd.volume_ml')
            ->select('product_variant_links.product_id', 'vd.volume_ml');

        $selectParts = [];
        foreach (self::VOLUME_BUCKETS as $bucket) {
            $min = (int) ($bucket['min'] ?? 0);
            $max = $bucket['max'];
            $alias = (string) $bucket['key'];

            if ($max !== null) {
                $selectParts[] = sprintf(
                    'COUNT(DISTINCT CASE WHEN volume_ml >= %d AND volume_ml <= %d THEN product_id END) as `%s`',
                    $min,
                    (int) $max,
                    $alias,
                );
            } else {
                $selectParts[] = sprintf(
                    'COUNT(DISTINCT CASE WHEN volume_ml >= %d THEN product_id END) as `%s`',
                    $min,
                    $alias,
                );
            }
        }

        $row = DB::query()
            ->fromSub($variantVolumeQuery, 'variant_volumes')
            ->whereIn('product_id', $filteredProductIds)
            ->selectRaw(implode(', ', $selectParts))
            ->first();

        return collect(self::VOLUME_BUCKETS)
            ->map(static function (array $bucket) use ($row): array {
                $key = (string) $bucket['key'];

                return [
                    'key' => $key,
                    'label' => (string) $bucket['label'],
                    'products_count' => (int) ($row?->{$key} ?? 0),
                ];
            })
            ->values()
            ->all();
    }
}
