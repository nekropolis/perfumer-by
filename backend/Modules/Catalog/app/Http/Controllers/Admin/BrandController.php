<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Support\SlugHelper;

class BrandController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Brand::query()
            ->withCount('products')
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        $brands = $query->paginate(20);

        return response()->json($brands);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', 'unique:brands,slug'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $brand = Brand::create([
            'name' => $validated['name'],
            'slug' => SlugHelper::slugify($validated['slug']),
            'seo_title' => $validated['name'],
            'seo_description' => null,
            'description' => null,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Бренд создан',
            'data' => $brand->loadCount('products'),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $brand = Brand::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'required',
                'string',
                'max:255',
                Rule::unique('brands', 'slug')->ignore($brand->id),
            ],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $brand->update([
            'name' => $validated['name'],
            'slug' => SlugHelper::slugify($validated['slug']),
            'seo_title' => $validated['name'],
            'is_active' => $validated['is_active'] ?? $brand->is_active,
        ]);

        return response()->json([
            'message' => 'Бренд обновлён',
            'data' => $brand->fresh()->loadCount('products'),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $brand = Brand::query()->withCount('products')->findOrFail($id);

        if ($brand->products_count > 0) {
            return response()->json([
                'message' => 'Нельзя удалить бренд, к нему привязаны товары',
            ], 422);
        }

        $brand->delete();

        return response()->json([
            'message' => 'Бренд удалён',
        ]);
    }
}
