<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $mainImage = $this->images->firstWhere('is_main', true) ?? $this->images->first();
        $minPrice = $this->variants->min('price');
        $oldPrice = $this->variants
            ->filter(fn ($variant) => !is_null($variant->old_price))
            ->max('old_price');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'h1' => $this->h1,
            'short_description' => $this->short_description,
            'brand' => $this->brand?->name,
            'is_new' => $this->is_new,
            'is_hit' => $this->is_hit,
            'min_price' => $minPrice,
            'old_price' => $oldPrice,
            'image' => $mainImage?->path,
        ];
    }
}
