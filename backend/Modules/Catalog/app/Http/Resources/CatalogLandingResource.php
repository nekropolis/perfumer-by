<?php

namespace Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \Modules\Catalog\Models\CatalogLanding */
class CatalogLandingResource extends JsonResource
{
    private function filtersForJson(): \stdClass
    {
        $filters = $this->filters;
        $obj = new \stdClass;
        if (! is_array($filters) || $filters === []) {
            return $obj;
        }

        foreach ($filters as $attributeId => $optionIds) {
            if (! is_array($optionIds) || $optionIds === []) {
                continue;
            }
            $prop = (string) $attributeId;
            $obj->{$prop} = array_values(array_map('intval', $optionIds));
        }

        return $obj;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'slug' => $this->slug,
            'gender' => $this->gender,
            'filters' => $this->filtersForJson(),
            'h1' => $this->h1,
            'seo_title' => $this->seo_title,
            'seo_description' => $this->seo_description,
            'content' => $this->content,
            'is_active' => (bool) $this->is_active,
            'sort' => (int) $this->sort,
            'updated_at' => $this->updated_at,
        ];
    }
}
