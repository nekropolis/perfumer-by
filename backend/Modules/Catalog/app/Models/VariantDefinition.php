<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VariantDefinition extends Model
{
    protected $fillable = [
        'volume_ml',
        'concentration_code',
        'concentration_label',
        'is_tester',
        'excludes_from_free_delivery_threshold',
        'title',
        'sort_order',
    ];

    protected $casts = [
        'is_tester' => 'boolean',
        'excludes_from_free_delivery_threshold' => 'boolean',
    ];

    public function productLinks(): HasMany
    {
        return $this->hasMany(ProductVariantLink::class);
    }
}
