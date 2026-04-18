<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class ProductDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variants = $this->relationLoaded('activeVariants')
            ? $this->activeVariants
            : collect();

        $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');
        $variantIds = $variants->pluck('id')->filter()->values();

        $stocks = WarehouseVariantStock::query()
            ->whereIn('variant_id', $variantIds)
            ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
            ->get()
            ->groupBy('variant_id');

        $prices = $variants
            ->map(function ($variant) use ($stocks, $mainWarehouseId) {
                $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
                $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
                $mainAvailable = $mainStock ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) : 0;

                if ($mainAvailable > 0) {
                    return $variant->price;
                }

                return $variant->price;
            })
            ->filter();

        $stockTotal = (int) $variants->sum(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
            $mainAvailable = $mainStock ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) : 0;

            return $mainAvailable > 0
                ? (int) ($mainStock?->stock ?? 0)
                : (int) ($supplierStock?->stock ?? 0);
        });

        $availableStockTotal = (int) $variants->sum(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
            $mainAvailable = $mainStock ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) : 0;

            return $mainAvailable > 0
                ? $mainAvailable
                : ($supplierStock ? max(0, (int) $supplierStock->stock - (int) $supplierStock->reserved_stock) : 0);
        });

        $defaultVariant = $variants->first(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
            $mainAvailable = $mainStock ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) : 0;
            $supplierAvailable = $supplierStock ? max(0, (int) $supplierStock->stock - (int) $supplierStock->reserved_stock) : 0;

            return $mainAvailable > 0 || $supplierAvailable > 0 || $variant->is_preorder;
        })
            ?? $variants->first();

        return [
            'id' => $this->id,
            'is_active' => $this->is_active,
            'is_out_of_stock' => (bool) $this->is_out_of_stock,
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

                        'attribute' => $item->productAttribute ? [
                            'id' => $item->productAttribute->id,
                            'name' => $item->productAttribute->name,
                            'type' => $item->productAttribute->type,
                            'options' => $item->productAttribute->relationLoaded('activeOptions')
                                ? $item->productAttribute->activeOptions->map(function ($option) {
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
                                ->filter(fn ($selected) => $selected->productAttributeOption)
                                ->map(function ($selected) {
                                    return [
                                        'id' => $selected->productAttributeOption->id,
                                        'name' => $selected->productAttributeOption->name,
                                        'sort_order' => $selected->productAttributeOption->sort_order,
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
            'available_stock_total' => $availableStockTotal,

            'variants' => ProductVariantResource::collection($variants),
            'default_variant_id' => $defaultVariant?->id,
        ];
    }
}
