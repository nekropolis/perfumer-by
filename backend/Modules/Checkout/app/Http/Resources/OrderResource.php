<?php

namespace Modules\Checkout\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'customer_name' => $this->customer_name,
            'phone' => $this->phone,
            'comment' => $this->comment,
            'status' => $this->status,
            'items_qty' => $this->items_qty,
            'subtotal' => number_format((float) $this->subtotal, 2, '.', ''),
            'total' => number_format((float) $this->total, 2, '.', ''),
            'items' => $this->items->map(function ($item) {
                return [
                    'id' => $item->id,
                    'product_name' => $item->product_name,
                    'product_slug' => $item->product_slug,
                    'brand_name' => $item->brand_name,
                    'variant_title' => $item->variant_title,
                    'sku' => $item->sku,
                    'qty' => $item->qty,
                    'price' => number_format((float) $item->price, 2, '.', ''),
                    'total' => number_format((float) $item->total, 2, '.', ''),
                ];
            })->values(),
        ];
    }
}
