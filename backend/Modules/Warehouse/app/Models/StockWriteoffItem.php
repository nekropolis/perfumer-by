<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

class StockWriteoffItem extends Model
{
    protected $fillable = [
        'stock_writeoff_id',
        'product_id',
        'variant_id',
        'product_name',
        'variant_title',
        'qty',
        'price',
        'payload',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'payload' => 'array',
    ];

    public function writeoff(): BelongsTo
    {
        return $this->belongsTo(StockWriteoff::class, 'stock_writeoff_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'variant_id');
    }
}
