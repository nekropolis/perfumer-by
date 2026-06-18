<?php

namespace Modules\Catalog\Services;

use Illuminate\Http\Request;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\CatalogProductQueryFilters;

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

        if ($sort === 'price_desc') {
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
}
