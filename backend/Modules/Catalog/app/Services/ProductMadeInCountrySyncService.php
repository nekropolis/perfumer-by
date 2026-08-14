<?php

namespace Modules\Catalog\Services;

use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeOption;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;
use Modules\Catalog\Support\CatalogProductAttributeIds;
use RuntimeException;

class ProductMadeInCountrySyncService
{
    /**
     * @param  iterable<int, ProductAttributeValue>  $attributeValues
     */
    public static function countryFromAttributeValues(iterable $attributeValues): ?string
    {
        foreach ($attributeValues as $value) {
            if ((int) $value->product_attribute_id !== CatalogProductAttributeIds::MADE_IN_ATTRIBUTE_ID) {
                continue;
            }

            if ($value->relationLoaded('selectedOptions')) {
                $option = $value->selectedOptions->first(fn ($selected) => $selected->productAttributeOption !== null);
                $optionName = trim((string) ($option?->productAttributeOption?->name ?? ''));
                if ($optionName !== '') {
                    return $optionName;
                }
            }

            $customValue = trim((string) ($value->custom_value ?? ''));

            return $customValue !== '' ? $customValue : null;
        }

        return null;
    }

    /**
     * @param  list<int>  $productIds
     * @return array<int, string>
     */
    public function mapForProductIds(array $productIds): array
    {
        $ids = array_values(array_unique(array_filter(
            array_map(static fn ($id) => (int) $id, $productIds),
            static fn (int $id) => $id > 0,
        )));

        if ($ids === []) {
            return [];
        }

        $products = Product::query()
            ->whereIn('id', $ids)
            ->with([
                'attributeValues' => static fn ($query) => $query->where(
                    'product_attribute_id',
                    CatalogProductAttributeIds::MADE_IN_ATTRIBUTE_ID,
                ),
                'attributeValues.selectedOptions.productAttributeOption',
            ])
            ->get(['id']);

        $map = [];
        foreach ($products as $product) {
            $country = self::countryFromAttributeValues($product->attributeValues);
            if ($country !== null) {
                $map[(int) $product->id] = $country;
            }
        }

        return $map;
    }

    /**
     * @param  list<array{product_id: int, country: string|null}>  $updates
     * @return array{updated: list<int>, skipped: list<int>}
     */
    public function syncMany(array $updates): array
    {
        $attribute = ProductAttribute::query()->find(CatalogProductAttributeIds::MADE_IN_ATTRIBUTE_ID);
        if (! $attribute) {
            throw new RuntimeException('Атрибут «Сделано в» (id=13) не найден');
        }

        $byProductId = [];
        foreach ($updates as $row) {
            $productId = (int) ($row['product_id'] ?? 0);
            if ($productId <= 0) {
                continue;
            }
            $byProductId[$productId] = trim((string) ($row['country'] ?? ''));
        }

        $updated = [];
        $skipped = [];

        foreach ($byProductId as $productId => $country) {
            if (! Product::query()->whereKey($productId)->exists()) {
                $skipped[] = $productId;
                continue;
            }

            $this->syncOne($attribute, $productId, $country);
            $updated[] = $productId;
        }

        return [
            'updated' => $updated,
            'skipped' => $skipped,
        ];
    }

    private function syncOne(ProductAttribute $attribute, int $productId, string $country): void
    {
        $productValue = ProductAttributeValue::query()->firstOrCreate(
            [
                'product_id' => $productId,
                'product_attribute_id' => $attribute->id,
            ],
            [
                'custom_value' => null,
                'sort_order' => 0,
            ],
        );

        if ($country === '') {
            ProductAttributeValueOption::query()
                ->where('product_attribute_value_id', $productValue->id)
                ->delete();
            $productValue->update(['custom_value' => null]);

            return;
        }

        if ($attribute->type === 'text') {
            ProductAttributeValueOption::query()
                ->where('product_attribute_value_id', $productValue->id)
                ->delete();
            $productValue->update(['custom_value' => $country]);

            return;
        }

        $option = ProductAttributeOption::query()
            ->where('product_attribute_id', $attribute->id)
            ->where('name', $country)
            ->first();

        if (! $option) {
            $option = ProductAttributeOption::query()->create([
                'product_attribute_id' => $attribute->id,
                'name' => $country,
                'sort_order' => 0,
                'is_active' => true,
            ]);
        }

        ProductAttributeValueOption::query()
            ->where('product_attribute_value_id', $productValue->id)
            ->delete();

        ProductAttributeValueOption::query()->create([
            'product_attribute_value_id' => $productValue->id,
            'product_attribute_option_id' => $option->id,
        ]);

        $productValue->update(['custom_value' => null]);
    }
}
