<?php

namespace Modules\Catalog\Services\SeoDescription;

use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;

class ProductSeoPayloadBuilder
{
    public const FIELDS = [
        'seo_description',
        'short_description',
        'description',
    ];

    /**
     * @param  list<string>  $requestedFields
     * @return array{
     *     product_name: string,
     *     brand: string|null,
     *     specs: array<string, string|list<string>>,
     *     fields: array<string, string|null>,
     *     site: string
     * }
     */
    public function build(Product $product, array $requestedFields): array
    {
        $product->loadMissing([
            'brand',
            'attributeValues.productAttribute',
            'attributeValues.selectedOptions.productAttributeOption',
        ]);

        $fields = [];
        foreach ($requestedFields as $field) {
            if (! in_array($field, self::FIELDS, true)) {
                throw new SeoDescriptionException('Unsupported SEO generation field.');
            }
            $value = $product->getAttribute($field);
            $fields[$field] = $value === null ? null : (string) $value;
        }

        return [
            'product_name' => ProductDisplayName::forProduct($product),
            'brand' => $product->brand?->name,
            'specs' => $this->specs($product),
            'fields' => $fields,
            'site' => (string) config('seo_description.site', 'perfumer'),
        ];
    }

    /**
     * @param  array<string, mixed>  $snapshot
     */
    public function hash(array $snapshot): string
    {
        $this->sortRecursively($snapshot);

        return hash('sha256', json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    /**
     * @return array<string, string|list<string>>
     */
    private function specs(Product $product): array
    {
        /** @var array<string, list<string>> $grouped */
        $grouped = [];
        foreach ($product->attributeValues as $attributeValue) {
            $name = trim((string) $attributeValue->productAttribute?->name);
            if ($name === '') {
                continue;
            }

            $values = [];
            $custom = trim((string) $attributeValue->custom_value);
            if ($custom !== '') {
                $values[] = $custom;
            }
            foreach ($attributeValue->selectedOptions as $selectedOption) {
                $option = trim((string) $selectedOption->productAttributeOption?->name);
                if ($option !== '') {
                    $values[] = $option;
                }
            }

            $grouped[$name] = array_values(array_unique([
                ...($grouped[$name] ?? []),
                ...$values,
            ]));
        }

        $specs = [];
        foreach ($grouped as $name => $values) {
            if (count($values) === 1) {
                $specs[$name] = $values[0];
            } elseif ($values !== []) {
                $specs[$name] = $values;
            }
        }

        return $specs;
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private function sortRecursively(array &$value): void
    {
        if (! array_is_list($value)) {
            ksort($value);
        }

        foreach ($value as &$item) {
            if (is_array($item)) {
                $this->sortRecursively($item);
            }
        }
    }
}
