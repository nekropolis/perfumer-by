<?php

namespace Modules\Catalog\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Modules\Catalog\Http\Resources\ProductDetailResource;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\Brand;

class ProductController extends Controller
{
    /**
     * Реальные колонки `product_variant_links` (объём/название концентрации — в `variant_definitions`, см. accessors на модели).
     *
     * @var list<string>
     */
    private const VARIANT_LINK_COLUMNS = [
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
     * Колонки `variant_definitions` для подгрузки к ссылке варианта (листинг / карточка).
     *
     * @var list<string>
     */
    private const VARIANT_DEFINITION_COLUMNS = [
        'id',
        'volume_ml',
        'concentration_code',
        'concentration_label',
        'is_tester',
        'title',
    ];

    public function index(Request $request): JsonResponse
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
            ])
            ->withCount([
                'activeVariants as in_stock_variants_count' => function ($q) {
                    $q->where('stock', '>', 0);
                },
            ])
            ->with([
                'brand:id,name,slug',
                'mainCategory:id,name,slug',
                'images' => static function ($q): void {
                    $q->select('id', 'product_id', 'path', 'is_main', 'sort_order')
                        ->orderByDesc('is_main')
                        ->orderBy('sort_order')
                        ->limit(1);
                },
                'activeVariants' => static function ($q): void {
                    $q->select(self::VARIANT_LINK_COLUMNS)
                        ->with([
                            'definition' => static function ($dq): void {
                                $dq->select(self::VARIANT_DEFINITION_COLUMNS);
                            },
                        ]);
                },
            ]);

        if ($request->filled('brand')) {
            $query->where('brand_id', (int) $request->input('brand'));
        }

        if ($request->filled('brand_slug')) {
            $query->whereHas('brand', function ($q) use ($request) {
                $q->where('slug', $request->string('brand_slug')->toString());
            });
        }

        $products = $query
            ->orderByDesc('in_stock_variants_count')
            ->orderBy('name')
            ->paginate(24);

        return response()->json([
            'data' => ProductListResource::collection($products->getCollection()),
            'meta' => [
                'current_page' => $products->currentPage(),
                'last_page' => $products->lastPage(),
                'per_page' => $products->perPage(),
                'total' => $products->total(),
            ],
        ]);
    }

    public function show(string $slug): JsonResponse
    {
        $product = Product::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->select([
                'id',
                'brand_id',
                'is_out_of_stock',
                'name',
                'slug',
                'h1',
                'short_description',
                'description',
                'seo_title',
                'seo_description',
            ])
            ->with([
                'brand:id,name,slug',
                'images' => static function ($q): void {
                    $q->select('id', 'product_id', 'path', 'is_main', 'sort_order')
                        ->orderByDesc('is_main')
                        ->orderBy('sort_order')
                        ->limit(24);
                },
                'attributeValues' => static function ($q): void {
                    $q->select('id', 'product_id', 'product_attribute_id', 'custom_value', 'sort_order')
                        ->orderBy('sort_order');
                },
                'attributeValues.productAttribute:id,name,type',
                'attributeValues.selectedOptions' => static function ($q): void {
                    $q->select('id', 'product_attribute_value_id', 'product_attribute_option_id');
                },
                'attributeValues.selectedOptions.productAttributeOption:id,name',
                'activeVariants' => static function ($q): void {
                    $q->select(self::VARIANT_LINK_COLUMNS)
                        ->with([
                            'definition' => static function ($dq): void {
                                $dq->select(self::VARIANT_DEFINITION_COLUMNS);
                            },
                        ]);
                },
            ])
            ->firstOrFail();

        return response()->json([
            'data' => new ProductDetailResource($product),
        ]);
    }

    public function brands(): JsonResponse
    {
        $brands = Brand::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'slug']);

        return response()->json([
            'data' => $brands,
        ]);
    }

    public function brandBySlug(string $slug): JsonResponse
    {
        $brand = Brand::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail(['id', 'name', 'slug']);

        return response()->json([
            'data' => $brand,
        ]);
    }
}
