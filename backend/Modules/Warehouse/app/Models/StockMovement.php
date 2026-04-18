<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

class StockMovement extends Model
{
    protected $fillable = [
        'type',
        'document_type',
        'document_id',
        'order_id',
        'warehouse_id',
        'product_id',
        'variant_id',
        'stock_delta',
        'reserved_delta',
        'stock_before',
        'stock_after',
        'reserved_before',
        'reserved_after',
        'payload',
        'created_by',
    ];

    protected $casts = [
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
