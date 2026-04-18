<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

class StockReservation extends Model
{
    protected $fillable = [
        'order_id',
        'order_item_id',
        'warehouse_id',
        'product_id',
        'variant_id',
        'qty',
        'status',
        'reserved_at',
        'released_at',
        'written_off_at',
        'payload',
    ];

    protected $casts = [
        'reserved_at' => 'datetime',
        'released_at' => 'datetime',
        'written_off_at' => 'datetime',
        'payload' => 'array',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'variant_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
