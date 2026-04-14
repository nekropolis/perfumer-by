<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductVariantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $displayParts = [];

        if ($this->volume) {
            $displayParts[] = trim($this->volume . ' ' . $this->volume_unit);
        }

        if ($this->concentration) {
            $displayParts[] = strtoupper($this->concentration);
        }

        if ($this->edition) {
            $displayParts[] = $this->edition;
        }

        $displayName = !empty($displayParts)
            ? implode(' / ', $displayParts)
            : 'Нет вариантов';

        return [
            'id' => $this->id,

            'volume' => $this->volume,
            'volume_unit' => $this->volume_unit,
            'type' => $this->type,
            'concentration' => $this->concentration,
            'edition' => $this->edition,

            'display_name' => $displayName,

            'price' => $this->price,
            'old_price' => $this->old_price,
            'discount_percent' => $this->discount_percent,

            'stock' => $this->stock,
            'is_preorder' => $this->is_preorder,
            'is_active' => $this->is_active,
            'is_available' => $this->stock > 0 || $this->is_preorder,
        ];
    }
}
