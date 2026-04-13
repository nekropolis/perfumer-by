<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;

class ProductAttributeAdminController extends Controller
{
    public function store(Request $request, int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'value' => ['required', 'string'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $attribute = ProductAttribute::create([
            'product_id' => $product->id,
            'name' => $validated['name'],
            'value' => $validated['value'],
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return response()->json([
            'message' => 'Атрибут добавлен',
            'data' => $attribute,
        ], 201);
    }

    public function update(Request $request, int $productId, int $attributeId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $attribute = ProductAttribute::query()
            ->where('product_id', $product->id)
            ->findOrFail($attributeId);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'value' => ['required', 'string'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $attribute->update([
            'name' => $validated['name'],
            'value' => $validated['value'],
            'sort_order' => $validated['sort_order'] ?? $attribute->sort_order,
        ]);

        return response()->json([
            'message' => 'Атрибут обновлен',
            'data' => $attribute->fresh(),
        ]);
    }

    public function destroy(int $productId, int $attributeId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $attribute = ProductAttribute::query()
            ->where('product_id', $product->id)
            ->findOrFail($attributeId);

        $attribute->delete();

        return response()->json([
            'message' => 'Атрибут удален',
        ]);
    }
}
