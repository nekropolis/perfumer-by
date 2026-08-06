<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
        'excludes_from_free_delivery_threshold' => 'boolean',
    ];

    public function productLinks(): HasMany
    {
        return $this->hasMany(ProductVariantLink::class);
    }
}
