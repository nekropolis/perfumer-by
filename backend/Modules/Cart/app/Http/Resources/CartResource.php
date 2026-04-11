<?php

namespace Modules\Cart\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CartResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $items = $this->items;

        $subtotal = $items->sum(function ($item) {
            $price = $item->variant?->price ? (float) $item->variant->price : 0;
            return $price * $item->qty;
        });

        $qty = $items->sum('qty');

        return [
            'id' => $this->id,
            'token' => $this->token,
            'qty' => $qty,
            'subtotal' => number_format($subtotal, 2, '.', ''),
            'total' => number_format($subtotal, 2, '.', ''),
            'items' => CartItemResource::collection($items),
        ];
    }
}
