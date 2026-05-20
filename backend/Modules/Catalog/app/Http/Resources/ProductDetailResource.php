<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductImagePathResolver;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class ProductDetailResource extends JsonResource
{
    private static function hasUsageTypeColumn(): bool
    {
        static $hasColumn = null;
        if ($hasColumn === null) {
            $hasColumn = Schema::hasColumn('product_images', 'usage_type');
        }

        return (bool) $hasColumn;
    }

    public function toArray(Request $request): array
    {
        $variants = $this->relationLoaded('variants')
            ? $this->variants
            : ($this->relationLoaded('activeVariants')
                ? $this->activeVariants
                : collect());

        $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');
        $variantIds = $variants->pluck('id')->filter()->values();

        $stocks = WarehouseVariantStock::query()
            ->whereIn('variant_id', $variantIds)
            ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
            ->get()
            ->groupBy('variant_id');

        $prices = $variants
            ->map(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
                $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
                $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
                $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
                $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

                return CatalogVariantStockPresenter::storefrontVariantPrice($variant, $presented);
            })
            ->filter();

        $stockTotal = (int) $variants->sum(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;

            return CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock)['stock'];
        });

        $defaultVariant = $variants->first(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
            $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

            return $presented['is_available'] || $variant->is_preorder;
        })
            ?? $variants->first();

        return [
            'id' => $this->id,
            'is_active' => (bool) $this->is_active,
            'is_new' => (bool) $this->is_new,
            'is_hit' => (bool) $this->is_hit,
            'is_out_of_stock' => (bool) $this->is_out_of_stock,
            'name' => $this->name,
            'slug' => $this->slug,
            'h1' => $this->h1,
            'short_description' => $this->short_description,
            'description' => $this->description,
            'seo_title' => $this->seo_title,
            'seo_description' => $this->seo_description,
            'seo_keyword' => $this->seo_keyword,

            'brand' => $this->brand ? [
                'id' => $this->brand->id,
                'name' => $this->brand->name,
                'slug' => $this->brand->slug,
            ] : null,

            'images' => $this->whenLoaded('images', function () {
                $isAdminRoute = request()->is('api/admin/*');
                $images = $this->images;
                if (! $isAdminRoute && self::hasUsageTypeColumn()) {
                    $images = $images->filter(fn ($image) => (string) ($image->usage_type ?? 'gallery') !== 'catalog');
                }

                return $images->map(function ($image) use ($isAdminRoute) {
                    $item = [
                        'id' => $image->id,
                        'path' => $isAdminRoute
                            ? (string) $image->path
                            : ProductImagePathResolver::resolve($image, 'card'),
                        'alt' => $image->alt,
                        'is_main' => (bool) $image->is_main,
                        'sort_order' => $image->sort_order,
                        'usage_type' => (string) ($image->usage_type ?? 'gallery'),
                        'watermark_status' => (string) ($image->watermark_status ?? 'none'),
                    ];

                    if (ProductImagePathResolver::hasVariantColumns()) {
                        $item['path_full'] = ProductImagePathResolver::resolve($image, 'full');
                        $item['path_thumb'] = ProductImagePathResolver::resolve($image, 'thumb');

                        if ($isAdminRoute) {
                            $item['path_card'] = ProductImagePathResolver::resolve($image, 'card');
                            $item['path_listing'] = ProductImagePathResolver::resolve($image, 'listing');
                        }
                    }

                    return $item;
                })->values()->all();
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
                            // Витрина: не отдаём activeOptions (тысячи значений → раздувание RSC/HTML).
                        ] : null,

                        'selected_options' => $item->relationLoaded('selectedOptions')
                            ? $item->selectedOptions
                                ->filter(fn ($selected) => $selected->productAttributeOption)
                                ->map(function ($selected) {
                                    return [
                                        'id' => $selected->productAttributeOption->id,
                                        'name' => $selected->productAttributeOption->name,
                                    ];
                                })->values()->all()
                            : [],
                    ];
                })->values()->all();
            }),


            'price_range' => [
                'min' => $prices->isNotEmpty() ? $prices->min() : null,
                'max' => $prices->isNotEmpty() ? $prices->max() : null,
            ],

            'stock_total' => $stockTotal,

            'variants' => ProductVariantResource::collection($variants)->resolve(),
            'default_variant_id' => $defaultVariant?->id,
        ];
    }
}
