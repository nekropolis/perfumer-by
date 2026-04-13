<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Catalog\Http\Resources\ProductDetailResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Support\SlugHelper;

class ProductAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Product::query()
            ->with(['brand'])
            ->withCount('variants')
            ->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        if ($request->filled('brand_id')) {
            $query->where('brand_id', (int) $request->input('brand_id'));
        }

        $products = $query->paginate(20);

        return response()->json($products);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'brand_id' => ['required', 'integer', 'exists:brands,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', 'unique:products,slug'],
            'is_active' => ['nullable', 'boolean'],
            'h1' => ['nullable', 'string', 'max:255'],
            'short_description' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
        ]);

        $product = Product::create([
            'brand_id' => $validated['brand_id'],
            'main_category_id' => null,
            'name' => $validated['name'],
            'slug' => SlugHelper::slugify($validated['slug']),
            'h1' => $validated['h1'] ?: $validated['name'],
            'short_description' => $validated['short_description'] ?? null,
            'description' => $validated['description'] ?? null,
            'seo_title' => $validated['seo_title'] ?: $validated['name'],
            'seo_description' => $validated['seo_description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'is_new' => false,
            'is_hit' => false,
            'sort_order' => 0,
        ]);

        return response()->json([
            'message' => 'Продукт создан',
            'data' => $product->load(['brand'])->loadCount('variants'),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);

        $validated = $request->validate([
            'brand_id' => ['required', 'integer', 'exists:brands,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'required',
                'string',
                'max:255',
                Rule::unique('products', 'slug')->ignore($product->id),
            ],
            'is_active' => ['nullable', 'boolean'],
            'h1' => ['nullable', 'string', 'max:255'],
            'short_description' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
        ]);

        $product->update([
            'brand_id' => $validated['brand_id'],
            'name' => $validated['name'],
            'h1' => $validated['h1'] ?: $validated['name'],
            'short_description' => $validated['short_description'] ?? null,
            'description' => $validated['description'] ?? null,
            'seo_title' => $validated['seo_title'] ?: $validated['name'],
            'seo_description' => $validated['seo_description'] ?? null,
            'is_active' => $validated['is_active'] ?? $product->is_active,
        ]);

        return response()->json([
            'message' => 'Продукт обновлён',
            'data' => $product->fresh()->load(['brand'])->loadCount('variants'),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $product = Product::query()
            ->withCount('variants')
            ->findOrFail($id);
        if ($product->variants_count > 0) {
            return response()->json([
                'message' => 'Нельзя удалить продукт, у него есть варианты',
            ], 422);
        }

        $product->delete();

        return response()->json([
            'message' => 'Продукт удалён',
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

    public function show(int $id): JsonResponse
    {
        $product = Product::query()
            ->with([
                'brand',
                'images',
                'variants',
                'attributeValues.attribute.activeOptions',
                'attributeValues.selectedOptions.attributeOption',
            ])
            ->withCount('variants')
            ->findOrFail($id);

        return response()->json([
            'data' => ProductDetailResource::make($product)->resolve(),
        ]);
    }
}
