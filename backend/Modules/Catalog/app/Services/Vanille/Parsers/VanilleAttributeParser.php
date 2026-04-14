<?php

namespace Modules\Catalog\Services\Vanille\Parsers;

use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeOption;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;

class VanilleAttributeParser
{
    public function syncProductAttributes(int $productId, array $characteristics): void
    {
        $existingValues = ProductAttributeValue::query()
            ->where('product_id', $productId)
            ->get()
            ->keyBy('product_attribute_id');

        $usedValueIds = [];
        $sortOrder = 0;

        foreach ($characteristics as $name => $rawValue) {
            $attributeName = trim((string) $name);
            $rawValue = trim((string) $rawValue);

            if ($attributeName === '' || $rawValue === '') {
                continue;
            }

            $parts = $this->splitValue($rawValue);
            if (empty($parts)) {
                continue;
            }

            $type = count($parts) > 1 ? 'multiselect' : 'select';

            $attribute = ProductAttribute::query()->firstOrCreate(
                ['name' => $attributeName],
                [
                    'type' => $type,
                    'sort_order' => 0,
                    'is_active' => true,
                ]
            );

            if ($attribute->type !== $type) {
                $attribute->update([
                    'type' => $type,
                ]);
            }

            $productValue = $existingValues[$attribute->id] ?? ProductAttributeValue::query()->create([
                'product_id' => $productId,
                'product_attribute_id' => $attribute->id,
                'custom_value' => null,
                'sort_order' => $sortOrder,
            ]);

            $productValue->update([
                'custom_value' => null,
                'sort_order' => $sortOrder,
            ]);

            $usedValueIds[] = $productValue->id;

            ProductAttributeValueOption::query()
                ->where('product_attribute_value_id', $productValue->id)
                ->delete();

            foreach ($parts as $part) {
                $normalized = $this->normalizeOptionName($part);

                if ($normalized === '') {
                    continue;
                }

                $option = ProductAttributeOption::query()->firstOrCreate(
                    [
                        'product_attribute_id' => $attribute->id,
                        'name' => $normalized,
                    ],
                    [
                        'sort_order' => 0,
                        'is_active' => true,
                    ]
                );

                ProductAttributeValueOption::query()->firstOrCreate([
                    'product_attribute_value_id' => $productValue->id,
                    'product_attribute_option_id' => $option->id,
                ]);
            }

            $sortOrder++;
        }

        $query = ProductAttributeValue::query()
            ->where('product_id', $productId);

        if (!empty($usedValueIds)) {
            $query->whereNotIn('id', $usedValueIds);
        }

        $query->delete();
    }

    private function splitValue(string $value): array
    {
        $value = trim($value);

        if ($value === '') {
            return [];
        }

        return array_values(array_filter(array_map(
            fn ($part) => trim($part),
            explode(',', $value)
        ), fn ($part) => $part !== ''));
    }

    private function normalizeOptionName(string $value): string
    {
        $value = trim($value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return $value;
    }
}
