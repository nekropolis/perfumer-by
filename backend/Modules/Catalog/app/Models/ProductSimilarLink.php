<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSimilarLink extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'product_id',
        'similar_product_id',
        'position',
    ];

    protected $casts = [
        'position' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function similarProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'similar_product_id');
    }
}
