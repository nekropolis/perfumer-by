<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Catalog\Support\VariantDefinitionResolver;

class VariantDefinition extends Model
{
    protected $fillable = [
        'volume_ml',
        'volume_label',
        'concentration_code',
        'concentration_label',
        'is_tester',
        'is_vial',
        'is_miniature',
        'is_set',
        'is_old_design',
        'is_new_design',
        'excludes_from_free_delivery_threshold',
        'title',
        'sort_order',
    ];

    protected $casts = [
        'volume_ml' => 'float',
        'is_tester' => 'boolean',
        'is_vial' => 'boolean',
        'is_miniature' => 'boolean',
        'is_set' => 'boolean',
        'is_old_design' => 'boolean',
        'is_new_design' => 'boolean',
        'excludes_from_free_delivery_threshold' => 'boolean',
    ];

    public function productLinks(): HasMany
    {
        return $this->hasMany(ProductVariantLink::class);
    }

    public function displayTitle(): string
    {
        if ($this->is_set) {
            return VariantDefinitionResolver::buildSetTitle($this->volume_label, $this->concentration_label);
        }

        return trim((string) $this->title);
    }

    public function designLabel(): ?string
    {
        if ($this->is_old_design) {
            return 'старый дизайн';
        }

        if ($this->is_new_design) {
            return 'новый дизайн';
        }

        return null;
    }
}
