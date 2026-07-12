<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\CatalogProductQueryFilters;
use Modules\Warehouse\Models\Warehouse;

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

        $query = Product::query()
            ->where('products.is_active', true)
            ->select([
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
            'activeVariants' => static function ($q): void {
                $q->select(self::VARIANT_LINK_COLUMNS)
                    ->with([
                        'definition' => static function ($dq): void {
                            $dq->select(self::VARIANT_DEFINITION_COLUMNS);
                        },
                    ]);
            },
        ]);

        $sort = $request->string('sort')->toString();

        if ($sort === 'popular') {
            $mainWarehouseId = $this->resolveWarehouseId(Warehouse::CODE_MAIN);
            $supplierWarehouseId = $this->resolveWarehouseId(Warehouse::CODE_SUPPLIER);

            $this->applyPopularInStockFilter($query, $mainWarehouseId, $supplierWarehouseId);

            $query->orderByRaw(
                'COALESCE((SELECT 0 FROM warehouse_variant_stocks '
                . 'INNER JOIN product_variant_links ON product_variant_links.id = warehouse_variant_stocks.variant_id '
                . 'WHERE warehouse_variant_stocks.warehouse_id = ? '
                . 'AND (warehouse_variant_stocks.stock - COALESCE(warehouse_variant_stocks.reserved_stock, 0)) > 0 '
                . 'AND product_variant_links.product_id = products.id '
                . 'AND product_variant_links.is_active = 1 '
                . 'LIMIT 1), 1)',
                [$mainWarehouseId]
            )
                ->orderByRaw('CRC32(CONCAT(products.id, CURDATE()))');
        } elseif ($sort === 'price_desc') {
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
            ->where('is_promotion', true)
            ->catalogListingEligible()
            ->whereHas('product', function ($productQuery) use ($request): void {
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
     * @param  Builder<Product>  $query
     */
    private function applyPopularInStockFilter(
        Builder $query,
        int $mainWarehouseId,
        int $supplierWarehouseId,
    ): void {
        $warehouseIds = array_values(array_filter([$mainWarehouseId, $supplierWarehouseId]));

        if ($warehouseIds === []) {
            $query->whereRaw('0 = 1');

            return;
        }

        $query->whereHas('activeVariants', function (Builder $variantQuery) use ($warehouseIds): void {
            $variantQuery
                ->where('is_preorder', false)
                ->whereNotNull('price')
                ->where('price', '>', 0)
                ->whereHas('warehouseStocks', function (Builder $stockQuery) use ($warehouseIds): void {
                    $stockQuery
                        ->whereIn('warehouse_id', $warehouseIds)
                        ->whereRaw('(stock - COALESCE(reserved_stock, 0)) > 0');
                });
        });
    }

    /**
     * @param  Collection<int, Product>  $products
     * @return Collection<int, Product>
     */
    private function narrowPopularListingVariants(Collection $products): Collection
    {
        if ($products->isEmpty()) {
            return $products;
        }

        $stockContext = CatalogListingStockContext::fromProducts($products);

        foreach ($products as $product) {
            if (!$product->relationLoaded('activeVariants')) {
                continue;
            }

            $variants = $product->activeVariants;
            $hasMainStock = $variants->contains(function (ProductVariantLink $variant) use ($stockContext): bool {
                return $this->variantHasMainWarehouseAvailableStock($stockContext, $variant);
            });

            $filtered = $variants->filter(function (ProductVariantLink $variant) use ($stockContext, $hasMainStock): bool {
                if ((bool) $variant->is_preorder) {
                    return false;
                }

                if ($hasMainStock) {
                    if (!$this->variantHasMainWarehouseAvailableStock($stockContext, $variant)) {
                        return false;
                    }
                } elseif (!$this->variantHasOtherWarehouseAvailableStock($stockContext, $variant)) {
                    return false;
                }

                $presented = $stockContext->presentedForListing($variant);

                return $stockContext->storefrontVariantPrice($variant, $presented) !== null;
            });

            $product->setRelation('activeVariants', $filtered->values());
        }

        return $products
            ->filter(static function (Product $product): bool {
                return $product->relationLoaded('activeVariants')
                    && $product->activeVariants->isNotEmpty();
            })
            ->values();
    }

    private function variantHasMainWarehouseAvailableStock(
        CatalogListingStockContext $stockContext,
        ProductVariantLink $variant,
    ): bool {
        [$mainStock] = $stockContext->warehouseStocksForVariant($variant);

        return $mainStock !== null
            && max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) > 0;
    }

    private function variantHasOtherWarehouseAvailableStock(
        CatalogListingStockContext $stockContext,
        ProductVariantLink $variant,
    ): bool {
        $presented = $stockContext->presentedForListing($variant);

        if (($presented['availability_source'] ?? '') === 'supplier_only') {
            return false;
        }

        [, $supplierStock] = $stockContext->warehouseStocksForVariant($variant);

        return $supplierStock !== null
            && max(0, (int) $supplierStock->stock - (int) $supplierStock->reserved_stock) > 0;
    }

    private function resolveWarehouseId(string $code): int
    {
        return (int) Cache::remember("catalog:warehouse:{$code}", 3600, static function () use ($code): int {
            return (int) (Warehouse::query()->where('code', $code)->value('id') ?? 0);
        });
    }
}
