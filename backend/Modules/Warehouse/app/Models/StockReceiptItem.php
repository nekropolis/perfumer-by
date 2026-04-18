<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

class StockReceiptItem extends Model
{
    protected $fillable = [
        'stock_receipt_id',
        'product_id',
        'variant_id',
        'product_name',
        'variant_title',
        'qty',
        'supplier_price',
        'line_total',
        'supplier_sku',
        'payload',
    ];

    protected $casts = [
        'supplier_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'payload' => 'array',
    ];

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(StockReceipt::class, 'stock_receipt_id');
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
