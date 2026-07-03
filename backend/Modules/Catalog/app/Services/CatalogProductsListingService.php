<?php

namespace Modules\Catalog\Services;

use Illuminate\Http\Request;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
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
            ->where('is_active', true)
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
                'is_out_of_stock',
                'listing_min_price',
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
            $mainWarehouseId = (int) Warehouse::query()
                ->where('code', Warehouse::CODE_MAIN)
                ->value('id');

            $query->orderByRaw(
                'COALESCE((SELECT 0 FROM warehouse_variant_stocks '
                . 'INNER JOIN product_variant_links ON product_variant_links.id = warehouse_variant_stocks.variant_id '
                . 'WHERE warehouse_variant_stocks.warehouse_id = ? '
                . 'AND warehouse_variant_stocks.stock > 0 '
                . 'AND product_variant_links.product_id = products.id '
                . 'AND product_variant_links.is_active = 1 '
                . 'LIMIT 1), 1)',
                [$mainWarehouseId]
            )
                ->orderByRaw('RAND(DAY(CURDATE()))');
        } elseif ($sort === 'price_desc') {
            $query->orderByRaw('CASE WHEN listing_min_price IS NULL THEN 1 ELSE 0 END')
                ->orderByDesc('listing_min_price')
                ->orderBy('name');
        } elseif ($sort === 'name_desc') {
            $query->orderByDesc('name');
        } elseif ($sort === 'name_asc') {
            $query->orderBy('name');
        } else {
            $query->orderByRaw('CASE WHEN listing_min_price IS NULL THEN 1 ELSE 0 END')
                ->orderBy('listing_min_price')
                ->orderBy('name');
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
                ->orderByDesc('promo_products.name')
                ->select('product_variant_links.*');
        } elseif ($sort === 'name_asc') {
            $query->join('products as promo_products', 'promo_products.id', '=', 'product_variant_links.product_id')
                ->orderBy('promo_products.name')
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
}
