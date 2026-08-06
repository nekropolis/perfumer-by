<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSetComponent extends Model
{
    protected $fillable = [
        'product_set_id',
        'volume_label',
        'concentration_label',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function productSet(): BelongsTo
    {
        return $this->belongsTo(ProductSet::class);
    }
}
