<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\CatalogProductQueryFilters;
use Modules\Catalog\Support\CatalogVariantStockPresenter;

class CatalogProductsListingService
{
    /**
     * @var list<string>
     */
    private const array VARIANT_LINK_COLUMNS = [
        'id',
        'product_id',
        'variant_definition_id',
        'price',
        'old_price',
        'is_preorder',
        'is_active',
        'is_promotion',
        'stock',
        'reserved_stock',
        'sort_order',
    ];

    /**
     * @var list<string>
     */
    private const array VARIANT_DEFINITION_COLUMNS = [
        'id',
        'volume_ml',
        'concentration_code',
        'concentration_label',
        'is_tester',
        'is_vial',
        'is_miniature',
        'is_set',
        'is_old_design',
        'is_new_design',
        'title',
    ];

    /**
     * @return array{data: mixed, meta: array{current_page: int, last_page: int, per_page: int, total: int}}
     */
    public function list(Request $request): array
    {
        if ($request->input('sale') === '1') {
            return $this->listPromotionVariants($request);
        }

        $query = Product::query();
        CatalogProductQueryFilters::applyCatalogListingProductFilter($query);
        $query->select([
                'products.id',
                'products.brand_id',
                'products.main_category_id',
                'products.name',
                'products.slug',
                'products.h1',
                'products.short_description',
                'products.is_new',
                'products.is_hit',
                'products.is_set',
                'products.is_out_of_stock',
                'products.listing_min_price',
            ]);

        CatalogProductQueryFilters::applyListingFilters($query, $request);

        $query->with([
            'brand:id,name,slug',
            'mainCategory:id,name,slug',
            'images' => ProductListResource::imagesForListingEagerLoad(),
            'variants' => static function ($q): void {
                $q->where('is_active', true)
                    ->select(self::VARIANT_LINK_COLUMNS)
                    ->with([
                        'definition' => static function ($dq): void {
                            $dq->select(self::VARIANT_DEFINITION_COLUMNS);
                        },
                    ])
                    ->orderBy('sort_order');
            },
        ]);

        $sort = $request->string('sort')->toString();

        if ($sort === 'popular') {
            CatalogProductQueryFilters::applyPopularListingAvailabilitySort($query);
            $query->orderByRaw('CRC32(CONCAT(products.id, CURDATE()))');
        } else {
            CatalogProductQueryFilters::applyCatalogListingAvailabilitySort($query);

            if ($sort === 'price_desc') {
                $query->orderByRaw('CASE WHEN products.listing_min_price IS NULL THEN 1 ELSE 0 END')
                    ->orderByDesc('products.listing_min_price')
                    ->orderBy('products.slug');
            } elseif ($sort === 'name_desc') {
                $query->orderByDesc('products.slug');
            } elseif ($sort === 'name_asc') {
                $query->orderBy('products.slug');
            } else {
                $query->orderByRaw('CASE WHEN products.listing_min_price IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('products.listing_min_price')
                    ->orderBy('products.slug');
            }
        }

        $products = $query->paginate(24);

        if ($sort === 'popular') {
            $products->setCollection(
                $this->narrowPopularListingVariants($products->getCollection())
            );
        }

        return [
            'data' => ProductListResource::resolveCollection($products->getCollection()),
            'meta' => [
                'current_page' => $products->currentPage(),
                'last_page' => $products->lastPage(),
                'per_page' => $products->perPage(),
                'total' => $products->total(),
            ],
        ];
    }

    /**
     * @param  list<int>  $ids
     * @return Collection<int, Product>
     */
    public function hydrateOrderedListingProducts(array $ids): Collection
    {
        $ids = array_values(array_filter(array_map(static fn ($id): int => (int) $id, $ids), static fn (int $id): bool => $id > 0));
        if ($ids === []) {
            return collect();
        }

        $products = Product::query()
            ->whereIn('id', $ids)
            ->where('is_active', true)
            ->whereHas('activeVariants', static function ($q): void {
                $q->whereNotNull('price');
            })
            ->select([
                'id',
                'brand_id',
                'main_category_id',
                'name',
                'slug',
                'h1',
                'short_description',
                'is_new',
                'is_hit',
                'is_set',
                'is_out_of_stock',
                'is_active',
                'listing_min_price',
            ])
            ->with([
                'brand:id,name,slug',
                'mainCategory:id,name,slug',
                'images' => ProductListResource::imagesForListingEagerLoad(),
                'activeVariants' => function ($q): void {
                    $q->select(self::VARIANT_LINK_COLUMNS)
                        ->with([
                            'definition' => static function ($dq): void {
                                $dq->select(self::VARIANT_DEFINITION_COLUMNS);
                            },
                        ])
                        ->orderBy('sort_order');
                },
            ])
            ->get()
            ->keyBy('id');

        return collect($ids)
            ->map(static fn (int $id): ?Product => $products->get($id))
            ->filter()
            ->values();
    }

    /**
     * @return array{data: mixed, meta: array{current_page: int, last_page: int, per_page: int, total: int}}
     */
    private function listPromotionVariants(Request $request): array
    {
        $query = Product::query();
        CatalogProductQueryFilters::applyCatalogListingProductFilter($query);
        $query->select([
                'products.id',
                'products.brand_id',
                'products.main_category_id',
                'products.name',
                'products.slug',
                'products.h1',
                'products.short_description',
                'products.is_new',
                'products.is_hit',
                'products.is_set',
                'products.is_out_of_stock',
                'products.listing_min_price',
            ]);

        CatalogProductQueryFilters::applyBaseFilters($query, $request);
        CatalogProductQueryFilters::applyAttributeFilters($query, $request);

        $query->whereHas('variants', function (Builder $variantQuery) use ($request): void {
            $this->constrainPromotionListingVariants($variantQuery, $request);
        });

        $query->with([
            'brand:id,name,slug',
            'mainCategory:id,name,slug',
            'images' => ProductListResource::imagesForListingEagerLoad(),
            'variants' => function ($variantQuery) use ($request): void {
                $builder = $variantQuery->getQuery();
                $this->constrainPromotionListingVariants($builder, $request);
                $builder->select(self::VARIANT_LINK_COLUMNS)
                    ->with([
                        'definition' => static function ($definitionQuery): void {
                            $definitionQuery->select(self::VARIANT_DEFINITION_COLUMNS);
                        },
                    ])
                    ->orderBy('sort_order');
            },
        ]);

        $sort = $request->string('sort')->toString();

        if ($sort === 'name_desc') {
            $query->orderByDesc('products.slug');
        } elseif ($sort === 'name_asc') {
            $query->orderBy('products.slug');
        } else {
            $promoMinPrice = ProductVariantLink::query()
                ->selectRaw('MIN(product_variant_links.price)')
                ->whereColumn('product_variant_links.product_id', 'products.id');
            $this->constrainPromotionListingVariants($promoMinPrice, $request);

            $query->addSelect(['promo_sort_price' => $promoMinPrice])
                ->orderByRaw('CASE WHEN promo_sort_price IS NULL THEN 1 ELSE 0 END');

            if ($sort === 'price_desc') {
                $query->orderByDesc('promo_sort_price');
            } else {
                $query->orderBy('promo_sort_price');
            }

            $query->orderBy('products.slug');
        }

        $products = $query->paginate(24);

        return [
            'data' => ProductListResource::resolveCollection($products->getCollection()),
            'meta' => [
                'current_page' => $products->currentPage(),
                'last_page' => $products->lastPage(),
                'per_page' => $products->perPage(),
                'total' => $products->total(),
            ],
        ];
    }

    /**
     * @param  Builder<ProductVariantLink>  $variantQuery
     */
    private function constrainPromotionListingVariants(Builder $variantQuery, Request $request): void
    {
        $variantQuery->where('is_promotion', true);
        CatalogVariantStockPresenter::applyStorefrontInStockScope($variantQuery);
        CatalogProductQueryFilters::applyVariantPriceFilters($variantQuery, $request);
        CatalogProductQueryFilters::applyVariantVolumeFilters($variantQuery, $request);
        CatalogProductQueryFilters::applyVariantTypeFlagFilters($variantQuery, $request);
    }

    /**
     * Popular sort already ranks products (main warehouse → supplier → preorder).
     * In the card keep every storefront-available variant (warehouse + offer + preorder),
     * not only the priority stock channel.
     *
     * @param  Collection<int, Product>  $products
     * @return Collection<int, Product>
     */
    private function narrowPopularListingVariants(Collection $products): Collection
    {
        if ($products->isEmpty()) {
            return $products;
        }

        if (CatalogListingStockContext::current() === null) {
            CatalogListingStockContext::prime($products);
        }

        $stockContext = CatalogListingStockContext::current();
        if ($stockContext === null) {
            return $products;
        }

        foreach ($products as $product) {
            $variants = $this->listingVariants($product);
            if ($variants->isEmpty() || (bool) $product->is_out_of_stock) {
                continue;
            }

            $filtered = $variants->filter(function (ProductVariantLink $variant) use ($stockContext): bool {
                if ((bool) $variant->is_preorder) {
                    return true;
                }

                $presented = $stockContext->presentedForListing($variant);

                return (bool) ($presented['is_available'] ?? false);
            });

            if ($filtered->isNotEmpty()) {
                $this->setListingVariants($product, $filtered->values());
            }
        }

        return $products;
    }

    /**
     * @return Collection<int, ProductVariantLink>
     */
    private function listingVariants(Product $product): Collection
    {
        if ($product->relationLoaded('variants')) {
            return $product->variants;
        }

        if ($product->relationLoaded('activeVariants')) {
            return $product->activeVariants;
        }

        return collect();
    }

    /**
     * @param  Collection<int, ProductVariantLink>  $variants
     */
    private function setListingVariants(Product $product, Collection $variants): void
    {
        if ($product->relationLoaded('variants')) {
            $product->setRelation('variants', $variants);

            return;
        }

        if ($product->relationLoaded('activeVariants')) {
            $product->setRelation('activeVariants', $variants);
        }
    }

}
