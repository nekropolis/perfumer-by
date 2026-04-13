<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Attribute;
use Modules\Catalog\Models\AttributeOption;

class AttributeOptionController extends Controller
{
    public function store(Request $request, int $attributeId): JsonResponse
    {
        $attribute = Attribute::query()->findOrFail($attributeId);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $option = AttributeOption::query()->create([
            'attribute_id' => $attribute->id,
            'name' => $validated['name'],
            'sort_order' => $validated['sort_order'] ?? 0,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Опция атрибута создана',
            'data' => $option,
        ], 201);
    }

    public function update(Request $request, int $attributeId, int $optionId): JsonResponse
    {
        $attribute = Attribute::query()->findOrFail($attributeId);

        $option = AttributeOption::query()
            ->where('attribute_id', $attribute->id)
            ->findOrFail($optionId);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $option->update([
            'name' => $validated['name'],
            'sort_order' => $validated['sort_order'] ?? $option->sort_order,
            'is_active' => $validated['is_active'] ?? $option->is_active,
        ]);

        return response()->json([
            'message' => 'Опция атрибута обновлена',
            'data' => $option->fresh(),
        ]);
    }

    public function destroy(int $attributeId, int $optionId): JsonResponse
    {
        $attribute = Attribute::query()->findOrFail($attributeId);

        $option = AttributeOption::query()
            ->where('attribute_id', $attribute->id)
            ->withCount('productValueOptions')
            ->findOrFail($optionId);

        if ($option->product_value_options_count > 0) {
            return response()->json([
                'message' => 'Нельзя удалить опцию, она используется в товарах',
            ], 422);
        }

        $option->delete();

        return response()->json([
            'message' => 'Опция атрибута удалена',
        ]);
    }
}
