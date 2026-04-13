<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Attribute;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;

class ProductAttributeValueController extends Controller
{
    public function store(Request $request, int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $validated = $request->validate([
            'attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'option_ids' => ['nullable', 'array'],
            'option_ids.*' => ['integer', 'exists:attribute_options,id'],
            'custom_value' => ['nullable', 'string'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $attribute = Attribute::query()
            ->with('options')
            ->findOrFail($validated['attribute_id']);

        $exists = ProductAttributeValue::query()
            ->where('product_id', $product->id)
            ->where('attribute_id', $attribute->id)
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'Эта характеристика уже привязана к товару',
            ], 422);
        }

        $productValue = ProductAttributeValue::query()->create([
            'product_id' => $product->id,
            'attribute_id' => $attribute->id,
            'custom_value' => $attribute->type === 'text'
                ? ($validated['custom_value'] ?? null)
                : null,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        $this->syncSelectedOptions(
            $productValue,
            $attribute,
            $validated['option_ids'] ?? []
        );

        return response()->json([
            'message' => 'Характеристика привязана к товару',
            'data' => $productValue->load([
                'attribute.activeOptions',
                'selectedOptions.attributeOption',
            ]),
        ], 201);
    }

    public function update(Request $request, int $productId, int $valueId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $productValue = ProductAttributeValue::query()
            ->where('product_id', $product->id)
            ->with('attribute.options')
            ->findOrFail($valueId);

        $validated = $request->validate([
            'option_ids' => ['nullable', 'array'],
            'option_ids.*' => ['integer', 'exists:attribute_options,id'],
            'custom_value' => ['nullable', 'string'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $attribute = $productValue->attribute;
        $productValue->update([
            'custom_value' => $attribute && $attribute->type === 'text'
                ? ($validated['custom_value'] ?? null)
                : null,
            'sort_order' => $validated['sort_order'] ?? $productValue->sort_order,
        ]);

        if ($attribute) {
            $this->syncSelectedOptions(
                $productValue,
                $attribute,
                $validated['option_ids'] ?? []
            );
        }

        return response()->json([
            'message' => 'Характеристика товара обновлена',
            'data' => $productValue->fresh()->load([
                'attribute.activeOptions',
                'selectedOptions.attributeOption',
            ]),
        ]);
    }

    public function destroy(int $productId, int $valueId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $productValue = ProductAttributeValue::query()
            ->where('product_id', $product->id)
            ->findOrFail($valueId);

        $productValue->delete();

        return response()->json([
            'message' => 'Характеристика отвязана от товара',
        ]);
    }

    private function syncSelectedOptions(
        ProductAttributeValue $productValue,
        Attribute $attribute,
        array $optionIds
    ): void {
        if ($attribute->type === 'text') {
            ProductAttributeValueOption::query()
                ->where('product_attribute_value_id', $productValue->id)
                ->delete();

            return;
        }

        $allowedOptionIds = $attribute->options->pluck('id')->all();

        $filtered = collect($optionIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => in_array($id, $allowedOptionIds, true))
            ->unique()
            ->values();

        if ($attribute->type === 'select') {
            $filtered = $filtered->take(1)->values();
        }

        ProductAttributeValueOption::query()
            ->where('product_attribute_value_id', $productValue->id)
            ->whereNotIn('attribute_option_id', $filtered->all())
            ->delete();

        foreach ($filtered as $optionId) {
            ProductAttributeValueOption::query()->firstOrCreate([
                'product_attribute_value_id' => $productValue->id,
                'attribute_option_id' => $optionId,
            ]);
        }
    }
}
