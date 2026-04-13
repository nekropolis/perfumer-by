<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variants = $this->relationLoaded('activeVariants')
            ? $this->activeVariants
            : collect();

        $prices = $variants->pluck('price')->filter();
        $stockTotal = (int) $variants->sum('stock');

        $defaultVariant = $variants->first(fn ($variant) => $variant->stock > 0 || $variant->is_preorder)
            ?? $variants->first();

        return [
            'id' => $this->id,
            'is_active' => $this->is_active,
            'name' => $this->name,
            'slug' => $this->slug,
            'h1' => $this->h1,
            'short_description' => $this->short_description,
            'description' => $this->description,
            'seo_title' => $this->seo_title,
            'seo_description' => $this->seo_description,

            'brand' => $this->brand ? [
                'id' => $this->brand->id,
                'name' => $this->brand->name,
                'slug' => $this->brand->slug,
            ] : null,


            'main_category' => $this->mainCategory ? [
                'id' => $this->mainCategory->id,
                'name' => $this->mainCategory->name,
                'slug' => $this->mainCategory->slug,
            ] : null,

            'categories' => $this->whenLoaded('categories', function () {
                return $this->categories->map(fn ($category) => [
                    'id' => $category->id,
                    'name' => $category->name,
                    'slug' => $category->slug,
                ])->values();
            }),

            'images' => $this->whenLoaded('images', function () {
                return $this->images->map(fn ($image) => [
                    'id' => $image->id,
                    'path' => $image->path,
                    'is_main' => (bool) $image->is_main,
                    'sort_order' => $image->sort_order,
                ])->values();
            }),

            'attribute_values' => $this->whenLoaded('attributeValues', function () {
                return $this->attributeValues->map(function ($item) {
                    return [
                        'id' => $item->id,
                        'custom_value' => $item->custom_value,
                        'sort_order' => $item->sort_order,

                        'attribute' => $item->attribute ? [
                            'id' => $item->attribute->id,
                            'name' => $item->attribute->name,
                            'type' => $item->attribute->type,
                            'options' => $item->attribute->relationLoaded('activeOptions')
                                ? $item->attribute->activeOptions->map(function ($option) {
                                    return [
                                        'id' => $option->id,
                                        'name' => $option->name,
                                        'sort_order' => $option->sort_order,
                                    ];
                                })->values()
                                : [],
                        ] : null,

                        'selected_options' => $item->relationLoaded('selectedOptions')
                            ? $item->selectedOptions
                                ->filter(fn ($selected) => $selected->attributeOption)
                                ->map(function ($selected) {
                                    return [
                                        'id' => $selected->attributeOption->id,
                                        'name' => $selected->attributeOption->name,
                                        'sort_order' => $selected->attributeOption->sort_order,
                                    ];
                                })->values()
                            : [],
                    ];
                })->values();
            }),


            'price_range' => [
                'min' => $prices->isNotEmpty() ? $prices->min() : null,
                'max' => $prices->isNotEmpty() ? $prices->max() : null,
            ],

            'stock_total' => $stockTotal,

            'variants' => ProductVariantResource::collection($variants),
            'default_variant_id' => $defaultVariant?->id,
        ];
    }
}
