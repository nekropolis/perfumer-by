<?php

namespace Modules\Cart\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CartItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variant = $this->variant;
        $product = $this->product;

        $price = $variant?->price ? (float) $variant->price : 0;
        $total = $price * $this->qty;
        $availableStock = $variant ? max(0, (int) $variant->stock - (int) ($variant->reserved_stock ?? 0)) : 0;

        $displayParts = [];

        if ($variant?->volume) {
            $displayParts[] = trim($variant->volume . ' ' . $variant->volume_unit);
        }

        if ($variant?->concentration) {
            $displayParts[] = strtoupper($variant->concentration);
        }

        if ($variant?->edition) {
            $displayParts[] = $variant->edition;
        }

        $displayName = !empty($displayParts)
            ? implode(' / ', $displayParts)
            : ($variant?->title ?? '');

        return [
            'id' => $this->id,
            'qty' => $this->qty,

            'product_id' => $product?->id,
            'product_variant_id' => $variant?->id,

            'product_name' => $product?->name,
            'product_slug' => $product?->slug,
            'brand_name' => $product?->brand?->name,

            'variant' => $variant ? [
                'id' => $variant->id,
                'title' => $variant->title,
                'display_name' => $displayName,
                'volume' => $variant->volume,
                'volume_unit' => $variant->volume_unit,
                'type' => $variant->type,
                'concentration' => $variant->concentration,
                'edition' => $variant->edition,
            ] : null,

            'price' => number_format($price, 2, '.', ''),
            'old_price' => $variant?->old_price
                ? number_format((float) $variant->old_price, 2, '.', '')
                : null,

            'total' => number_format($total, 2, '.', ''),
            'stock' => $variant?->stock ?? 0,
            'reserved_stock' => $variant?->reserved_stock ?? 0,
            'available_stock' => $availableStock,
            'is_preorder' => (bool) ($variant?->is_preorder ?? false),
            'is_available' => $variant ? ($availableStock > 0 || $variant->is_preorder) : false,
        ];
    }
}
