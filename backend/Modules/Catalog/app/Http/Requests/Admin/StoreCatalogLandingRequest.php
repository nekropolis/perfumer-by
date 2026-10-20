<?php

namespace Modules\Catalog\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeOption;

class StoreCatalogLandingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'is_active' => ['nullable', 'boolean'],
            'slug' => ['required', 'string', 'max:255', 'unique:catalog_landings,slug'],
            'gender' => ['nullable', 'string', Rule::in(['female', 'male', 'unisex'])],
            'filters' => ['nullable', 'array'],
            'filters.*' => ['array'],
            'filters.*.*' => ['integer', 'min:1'],
            'h1' => ['required', 'string', 'max:255'],
            'seo_title' => ['required', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
            'content' => ['nullable', 'string'],
            'sort' => ['nullable', 'integer', 'min:0'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $this->validateFilterAttributeKeys($validator);
        });
    }

    private function validateFilterAttributeKeys($validator): void
    {
        $filters = $this->input('filters');
        if (! is_array($filters) || $filters === []) {
            return;
        }

        $attributeIds = [];
        foreach (array_keys($filters) as $key) {
            if (! is_numeric($key)) {
                $validator->errors()->add('filters', 'Ключи фильтров должны быть ID атрибутов.');

                return;
            }
            $attributeIds[] = (int) $key;
        }

        $existingCount = ProductAttribute::query()->whereIn('id', $attributeIds)->count();
        if ($existingCount !== count(array_unique($attributeIds))) {
            $validator->errors()->add('filters', 'Указан несуществующий атрибут в фильтрах.');
        }

        foreach ($filters as $attributeId => $optionIds) {
            if (! is_array($optionIds) || $optionIds === []) {
                continue;
            }
            $attrId = (int) $attributeId;
            $validCount = ProductAttributeOption::query()
                ->where('product_attribute_id', $attrId)
                ->whereIn('id', $optionIds)
                ->count();
            if ($validCount !== count(array_unique($optionIds))) {
                $validator->errors()->add('filters', "Некорректные значения для атрибута {$attrId}.");
            }
        }
    }
}
