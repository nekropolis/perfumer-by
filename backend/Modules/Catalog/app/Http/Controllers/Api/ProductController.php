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
    public function index(Request $request): JsonResponse
    {
        $query = Product::query()
            ->where('is_active', true)
            ->withCount([
                'activeVariants as in_stock_variants_count' => function ($q) {
                    $q->where('stock', '>', 0);
                },
            ])
            ->with([
                'brand',
                'mainCategory',
                'categories',
                'images',
                'attributeValues.productAttribute.activeOptions',
                'attributeValues.selectedOptions.productAttributeOption',
                'activeVariants',
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
            ->with([
                'brand',
                'mainCategory',
                'categories',
                'images',
                'attributeValues.productAttribute.activeOptions',
                'attributeValues.selectedOptions.productAttributeOption',
                'activeVariants',
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
