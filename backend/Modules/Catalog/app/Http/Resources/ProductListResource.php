<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class ProductListResource extends JsonResource
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

        $prices = $variants->map(function ($variant) use ($stocks, $mainWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $mainAvailable = $mainStock ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) : 0;

            return $mainAvailable > 0 ? $variant->price : $variant->price;
        })->filter();
        $oldPrices = $variants->pluck('old_price')->filter();

        $minPrice = $prices->isNotEmpty() ? $prices->min() : null;
        $maxPrice = $prices->isNotEmpty() ? $prices->max() : null;

        $minOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->min() : null;
        $maxOldPrice = $oldPrices->isNotEmpty() ? $oldPrices->max() : null;

        $stockTotal = (int) $variants->sum(function ($variant) use ($stocks, $mainWarehouseId, $supplierWarehouseId) {
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
            $mainAvailable = $mainStock ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock) : 0;

            return $mainAvailable > 0
                ? (int) ($mainStock?->stock ?? 0)
                : (int) ($supplierStock?->stock ?? 0);
        });
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
            'is_out_of_stock' => (bool) $this->is_out_of_stock,

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
