<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variants = $this->relationLoaded('activeVariants')
            ? $this->activeVariants
            : collect();

        $prices = $variants->pluck('price')->filter();
        $oldPrices = $variants->pluck('old_price')->filter();

        $minPrice = $prices->isNotEmpty() ? $prices->min() : null;
        $maxPrice = $prices->isNotEmpty() ? $prices->max() : null;

        $minOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->min() : null;
        $maxOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->max() : null;

        $stockTotal = (int) $variants->sum('stock');
        $preorderAvailable = $variants->contains(fn ($variant) => (bool) $variant->is_preorder);

        $mainImage = $this->relationLoaded('mainImage') ? $this->mainImage : null;

        $discountPercent = null;
        if ($minOldPrice && $minPrice && $minOldPrice > $minPrice) {
            $discountPercent = (int) round((($minOldPrice - $minPrice) / $minOldPrice) * 100);
        }

        $variantLabels = $variants
            ->map(function ($variant) {
                $parts = [];

                if ($variant->volume) {
                    $parts[] = trim($variant->volume . ' ' . ($variant->volume_unit ?: 'ml'));
                }

                if ($variant->concentration) {
                    $parts[] = strtoupper($variant->concentration);
                } elseif ($variant->type) {
                    $parts[] = $variant->type;
                }

                if (!empty($parts)) {
                    return implode(' / ', $parts);
                }

                return $variant->title ?: null;
            })
            ->filter()
            ->unique()
            ->values();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'h1' => $this->h1,
            'short_description' => $this->short_description,

            'brand' => $this->brand ? [
                'id' => $this->brand->id,
                'name' => $this->brand->name,
            ] : null,

            'main_category' => $this->mainCategory ? [
                'id' => $this->mainCategory->id,
                'name' => $this->mainCategory->name,
                'slug' => $this->mainCategory->slug,
            ] : null,

            'image' => $mainImage?->path,

            'is_new' => $this->is_new,
            'is_hit' => $this->is_hit,

            'price_range' => [
                'min' => $minPrice,
                'max' => $maxPrice,
            ],

            'old_price_range' => [
                'min' => $minOldPrice,
                'max' => $maxOldPrice,
            ],

            'has_discount' => $discountPercent !== null,
            'discount_percent' => $discountPercent,

            'stock_total' => $stockTotal,
            'is_preorder_available' => $preorderAvailable,
            'variants_count' => $variants->count(),
            'variant_labels' => $variantLabels,
        ];
    }
}
