<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductVariantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'barcode' => $this->barcode,
            'title' => $this->title,
            'volume' => $this->volume,
            'volume_unit' => $this->volume_unit,
            'concentration' => $this->concentration,
            'edition' => $this->edition,
            'price' => $this->price,
            'old_price' => $this->old_price,
            'purchase_price' => $this->purchase_price,
            'stock' => $this->stock,
            'is_preorder' => $this->is_preorder,
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
            'discount_percent' => $this->discount_percent,
        ];
    }
}
