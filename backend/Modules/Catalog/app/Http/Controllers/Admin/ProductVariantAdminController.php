<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariant;

class ProductVariantAdminController extends Controller
{
    public function index(int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $variants = ProductVariant::query()
            ->where('product_id', $product->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $variants,
        ]);
    }

    public function store(Request $request, int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'volume' => ['nullable', 'integer', 'min:0'],
            'volume_unit' => ['nullable', 'string', 'max:20'],
            'type' => ['nullable', 'string', 'max:100'],
            'concentration' => ['nullable', 'string', 'max:50'],
            'edition' => ['nullable', 'string', 'max:100'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'old_price' => ['nullable', 'numeric', 'min:0'],
            'stock' => ['nullable', 'integer', 'min:0'],
            'is_preorder' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $variant = ProductVariant::create([
            'product_id' => $product->id,
            'title' => $validated['title'],
            'volume' => $validated['volume'] ?? null,
            'volume_unit' => $validated['volume_unit'] ?? null,
            'type' => $validated['type'] ?? null,
            'concentration' => $validated['concentration'] ?? null,
            'edition' => $validated['edition'] ?? null,
            'price' => $validated['price'] ?? null,
            'old_price' => $validated['old_price'] ?? null,
            'stock' => $validated['stock'] ?? 0,
            'is_preorder' => $validated['is_preorder'] ?? false,
            'is_active' => $validated['is_active'] ?? true,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return response()->json([
            'message' => 'Вариант добавлен',
            'data' => $variant,
        ], 201);
    }

    public function update(Request $request, int $productId, int $variantId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $variant = ProductVariant::query()
            ->where('product_id', $product->id)
            ->findOrFail($variantId);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'volume' => ['nullable', 'integer', 'min:0'],
            'volume_unit' => ['nullable', 'string', 'max:20'],
            'type' => ['nullable', 'string', 'max:100'],
            'concentration' => ['nullable', 'string', 'max:50'],
            'edition' => ['nullable', 'string', 'max:100'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'old_price' => ['nullable', 'numeric', 'min:0'],
            'stock' => ['nullable', 'integer', 'min:0'],
            'is_preorder' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $variant->update([
            'title' => $validated['title'],
            'volume' => $validated['volume'] ?? null,
            'volume_unit' => $validated['volume_unit'] ?? null,
            'type' => $validated['type'] ?? null,
            'concentration' => $validated['concentration'] ?? null,
            'edition' => $validated['edition'] ?? null,
            'price' => $validated['price'] ?? null,
            'old_price' => $validated['old_price'] ?? null,
            'stock' => $validated['stock'] ?? 0,
            'is_preorder' => $validated['is_preorder'] ?? false,
            'is_active' => $validated['is_active'] ?? true,
            'sort_order' => $validated['sort_order'] ?? $variant->sort_order,
        ]);

        return response()->json([
            'message' => 'Вариант обновлен',
            'data' => $variant->fresh(),
        ]);
    }

    public function destroy(int $productId, int $variantId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $variant = ProductVariant::query()
            ->where('product_id', $product->id)
            ->findOrFail($variantId);

        $variant->delete();

        return response()->json([
            'message' => 'Вариант удален',
        ]);
    }
}
