<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductDailyView extends Model
{
    protected $fillable = [
        'product_id',
        'viewed_on',
        'views_count',
    ];

    protected $casts = [
        'viewed_on' => 'date',
        'views_count' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
