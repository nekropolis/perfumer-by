<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

class WarehouseStockLot extends Model
{
    protected $fillable = [
        'warehouse_id',
        'product_id',
        'variant_id',
        'stock_receipt_item_id',
        'supplier_price',
        'qty',
        'reserved_qty',
        'supplier_sku',
        'supplier_name',
        'comment',
    ];

    protected $casts = [
        'supplier_price' => 'decimal:2',
        'qty' => 'integer',
        'reserved_qty' => 'integer',
    ];

    protected $appends = [
        'available_qty',
    ];

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'variant_id');
    }

    public function receiptItem(): BelongsTo
    {
        return $this->belongsTo(StockReceiptItem::class, 'stock_receipt_item_id');
    }

    public function getAvailableQtyAttribute(): int
    {
        return max(0, (int) $this->qty - (int) $this->reserved_qty);
    }
}
