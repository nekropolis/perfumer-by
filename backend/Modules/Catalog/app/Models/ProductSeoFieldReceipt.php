<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSeoFieldReceipt extends Model
{
    protected $fillable = [
        'product_id',
        'field',
        'value_hash',
        'product_seo_batch_item_id',
        'received_at',
    ];

    protected $casts = [
        'received_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function batchItem(): BelongsTo
    {
        return $this->belongsTo(ProductSeoBatchItem::class, 'product_seo_batch_item_id');
    }
}
