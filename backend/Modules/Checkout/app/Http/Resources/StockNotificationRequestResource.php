<?php

namespace Modules\Checkout\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockNotificationRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'product_id' => $this->product_id,
            'variant_id' => $this->variant_id,
            'product_name' => $this->product_name,
            'variant_title' => $this->variant_title,
            'phone' => $this->phone,
            'comment' => $this->comment,
            'status' => $this->status,
            'notified_at' => $this->notified_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'product' => $this->whenLoaded('product', function () {
                return [
                    'id' => $this->product?->id,
                    'name' => $this->product?->name,
                    'slug' => $this->product?->slug,
                ];
            }),
        ];
    }
}
