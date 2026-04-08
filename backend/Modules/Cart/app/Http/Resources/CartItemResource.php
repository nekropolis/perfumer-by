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

        return [
            'id' => $this->id,
            'qty' => $this->qty,
            'product' => $product ? [
                'id' => $product->id,
                'name' => $product->name,
                'slug' => $product->slug,
                'brand' => $product->brand?->name,
            ] : null,
            'variant' => $variant ? [
                'id' => $variant->id,
                'title' => $variant->title,
                'sku' => $variant->sku,
                'price' => $variant->price,
                'old_price' => $variant->old_price,
                'stock' => $variant->stock,
            ] : null,
            'price' => number_format($price, 2, '.', ''),
            'total' => number_format($total, 2, '.', ''),
        ];
    }
}
