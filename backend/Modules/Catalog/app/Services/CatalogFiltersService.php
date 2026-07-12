<?php

namespace Modules\Catalog\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogProductQueryFilters;

class CatalogFiltersService
{
    private const array VOLUME_BUCKETS = CatalogProductQueryFilters::VOLUME_BUCKETS;

    public function __construct(
        private readonly CatalogApiCacheService $cacheService,
    ) {}

    /**
     * @return array{data: array{price: array{min: float|null, max: float|null}, volume: list<array<string, mixed>>, attributes: list<array<string, mixed>>}}
     */
    public function build(Request $request): array
    {
        $attributeSchema = $this->loadFilterableAttributeSchema();
        $facetParams = CatalogProductQueryFilters::facetCacheQueryParams($request);

        $aggregates = $this->cacheService->rememberFacetAggregates(
            $facetParams,
            function () use ($request, $attributeSchema): array {
                $optionCounts = $this->resolveAttributeOptionCounts($request, $attributeSchema);

                return [
                    'price' => $this->resolvePriceBounds($request),
                    'volume' => $this->resolveVolumeFacetCounts($request),
                    'optionCounts' => $optionCounts
                        ->map(static fn (Collection $counts): array => $counts->all())
                        ->all(),
                ];
            },
        );

        $optionCounts = collect($aggregates['optionCounts'])
            ->map(static fn (array $counts): Collection => collect($counts));

        $attributePayload = collect($attributeSchema)
            ->map(function (array $attribute) use ($optionCounts): array {
                $attributeId = (int) $attribute['id'];
                $countsForAttribute = $optionCounts->get($attributeId, collect());

                $options = collect($attribute['options'])
                    ->map(function (array $option) use ($countsForAttribute): array {
                        $optionId = (int) $option['id'];

                        return [
                            'id' => $optionId,
                            'name' => (string) $option['name'],
                            'sort_order' => (int) $option['sort_order'],
                            'products_count' => (int) ($countsForAttribute->get($optionId, 0)),
                        ];
                    })
                    ->values()
                    ->all();

                return [
                    'id' => $attributeId,
                    'name' => (string) $attribute['name'],
                    'type' => (string) $attribute['type'],
                    'sort_order' => (int) $attribute['sort_order'],
                    'options' => $options,
                ];
            })
            ->values()
            ->all();

        return [
            'data' => [
                'price' => $aggregates['price'],
                'volume' => $aggregates['volume'],
                'attributes' => $attributePayload,
            ],
        ];
    }

    /**
     * @return array{min: float|null, max: float|null}
     */
    private function resolvePriceBounds(Request $request): array
    {
        $query = DB::table('products')->where('products.is_active', true);
        CatalogProductQueryFilters::applyBaseFiltersToQuery($query, $request);

        $row = $query
            ->selectRaw('MIN(products.listing_min_price) as price_min, MAX(products.listing_max_price) as price_max')
            ->first();

        return [
            'min' => $row?->price_min !== null ? (float) $row->price_min : null,
            'max' => $row?->price_max !== null ? (float) $row->price_max : null,
        ];
    }

    /**
     * @return list<array{
     *     id: int,
     *     name: string,
     *     type: string,
     *     sort_order: int,
     *     options: list<array{id: int, name: string, sort_order: int}>
     * }>
     */
    private function loadFilterableAttributeSchema(): array
    {
        return $this->cacheService->rememberFilterableAttributeSchema(static function (): array {
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
                ->get(['id', 'name', 'type', 'filter_sort_order'])
                ->map(static function (ProductAttribute $attribute): array {
                    return [
                        'id' => (int) $attribute->id,
                        'name' => (string) $attribute->name,
                        'type' => (string) $attribute->type,
                        'sort_order' => (int) $attribute->filter_sort_order,
                        'options' => $attribute->activeOptions
                            ->map(static fn ($option): array => [
                                'id' => (int) $option->id,
                                'name' => (string) $option->name,
                                'sort_order' => (int) $option->sort_order,
                            ])
                            ->values()
                            ->all(),
                    ];
                })
                ->values()
                ->all();
        });
    }

    /**
     * @param  list<array{id: int, options: list<array{id: int}>}>  $attributeSchema
     * @return Collection<int, Collection<int, int>>
     */
    private function resolveAttributeOptionCounts(Request $request, array $attributeSchema): Collection
    {
        $attributeIds = collect($attributeSchema)
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->values()
            ->all();

        if ($attributeIds === []) {
            return collect();
        }

        $filteredProducts = DB::table('products')
            ->where('products.is_active', true)
            ->select('products.id');

        CatalogProductQueryFilters::applyBaseFiltersToQuery($filteredProducts, $request);

        $rows = DB::table('products')
            ->join('product_attribute_values as pav', 'pav.product_id', '=', 'products.id')
            ->join(
                'product_attribute_value_options as pavo',
                'pavo.product_attribute_value_id',
                '=',
                'pav.id'
            )
            ->whereIn('products.id', $filteredProducts)
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
     * @return list<array{key: string, label: string, products_count: int}>
     */
    private function resolveVolumeFacetCounts(Request $request): array
    {
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

        $variantVolumeQuery = ProductVariantLink::query()
            ->catalogListingEligible()
            ->join('variant_definitions as vd', 'vd.id', '=', 'product_variant_links.variant_definition_id')
            ->whereNotNull('vd.volume_ml')
            ->whereExists(function ($productQuery) use ($request): void {
                $productQuery->selectRaw('1')
                    ->from('products')
                    ->whereColumn('products.id', 'product_variant_links.product_id')
                    ->where('products.is_active', true);

                CatalogProductQueryFilters::applyBaseFiltersToQuery($productQuery, $request);
            })
            ->select('product_variant_links.product_id', 'vd.volume_ml');

        $row = DB::query()
            ->fromSub($variantVolumeQuery, 'variant_volumes')
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
