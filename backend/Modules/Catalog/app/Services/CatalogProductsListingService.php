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
     * @return array{data: mixed, meta: array{current_page: int, last_page: int, per_page: int, total: int}}
     */
    private function listPromotionVariants(Request $request): array
    {
        $query = ProductVariantLink::query()
            ->where('is_promotion', true);
        CatalogVariantStockPresenter::applyStorefrontInStockScope($query);
        $query->whereHas('product', function ($productQuery) use ($request): void {
                $productQuery->where('is_active', true);
                CatalogProductQueryFilters::applyBaseFilters($productQuery, $request);
                CatalogProductQueryFilters::applyAttributeFilters($productQuery, $request);
            })
            ->with([
                'definition' => static function ($definitionQuery): void {
                    $definitionQuery->select(self::VARIANT_DEFINITION_COLUMNS);
                },
                'product' => static function ($productQuery): void {
                    $productQuery->select([
                        'id',
                        'brand_id',
                        'main_category_id',
                        'name',
                        'slug',
                        'h1',
                        'short_description',
                        'is_new',
                        'is_hit',
                        'is_out_of_stock',
                        'listing_min_price',
                    ]);
                },
                'product.brand:id,name,slug',
                'product.mainCategory:id,name,slug',
                'product.images' => ProductListResource::imagesForListingEagerLoad(),
            ]);

        CatalogProductQueryFilters::applyVariantPriceFilters($query, $request);
        CatalogProductQueryFilters::applyVariantVolumeFilters($query, $request);
        CatalogProductQueryFilters::applyVariantTypeFlagFilters($query, $request);

        $sort = $request->string('sort')->toString();

        if ($sort === 'price_desc') {
            $query->orderByRaw('CASE WHEN price IS NULL THEN 1 ELSE 0 END')
                ->orderByDesc('price')
                ->orderBy('id');
        } elseif ($sort === 'name_desc') {
            $query->join('products as promo_products', 'promo_products.id', '=', 'product_variant_links.product_id')
                ->orderByDesc('promo_products.slug')
                ->select('product_variant_links.*');
        } elseif ($sort === 'name_asc') {
            $query->join('products as promo_products', 'promo_products.id', '=', 'product_variant_links.product_id')
                ->orderBy('promo_products.slug')
                ->select('product_variant_links.*');
        } else {
            $query->orderByRaw('CASE WHEN price IS NULL THEN 1 ELSE 0 END')
                ->orderBy('price')
                ->orderBy('id');
        }

        $variants = $query->paginate(24);

        return [
            'data' => ProductListResource::resolvePromotionCollection($variants->getCollection()),
            'meta' => [
                'current_page' => $variants->currentPage(),
                'last_page' => $variants->lastPage(),
                'per_page' => $variants->perPage(),
                'total' => $variants->total(),
            ],
        ];
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
