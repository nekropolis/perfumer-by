<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Support\ProductImagePathResolver;
use Modules\Catalog\Support\VariantDefinitionVolume;

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

        $variants = VariantDefinitionVolume::sortVariantLinks($variants);

        $stockContext = CatalogListingStockContext::current()
            ?? CatalogListingStockContext::fromProducts(collect([$this->resource]));

        $presentedByVariant = [];
        foreach ($variants as $variant) {
            if ($variant instanceof ProductVariantLink) {
                $presentedByVariant[(int) $variant->id] = $stockContext->presentedForListing($variant);
            }
        }

        $prices = $variants
            ->map(function ($variant) use ($stockContext, $presentedByVariant) {
                $presented = $presentedByVariant[(int) $variant->id];

                return $stockContext->storefrontVariantPrice($variant, $presented);
            })
            ->filter();

        $stockTotal = (int) $variants->sum(
            fn ($variant) => $presentedByVariant[(int) $variant->id]['stock'] ?? 0
        );

        $defaultVariant = $variants->first(function ($variant) use ($presentedByVariant) {
            if (!$variant instanceof ProductVariantLink) {
                return false;
            }

            $presented = $presentedByVariant[(int) $variant->id] ?? null;
            if ($presented === null) {
                return false;
            }

            return $presented['is_available'] || $variant->is_preorder;
        }) ?? $variants->first();

        return [
            'id' => $this->id,
            'is_active' => (bool) $this->is_active,
            'is_new' => (bool) $this->is_new,
            'is_hit' => (bool) $this->is_hit,
            'is_out_of_stock' => (bool) $this->is_out_of_stock,
            'name' => $this->name,
            'display_name' => ProductDisplayName::format($this->brand?->name, (string) $this->name),
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

            'images' => $this->whenLoaded('images', function () use ($request) {
                $isAdminRoute = $request->is('api/admin/*');
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
