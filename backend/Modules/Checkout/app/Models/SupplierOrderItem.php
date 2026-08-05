<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\SupplierVariantOffer;

class SupplierOrderItem extends Model
{
    protected $table = 'supplier_order_items';

    protected $fillable = [
        'supplier_order_id',
        'order_id',
        'order_item_id',
        'product_id',
        'variant_id',
        'supplier_variant_offer_id',
        'supplier_product_name',
        'supplier_code',
        'retail_price',
        'purchase_price_at_order',
        'qty',
    ];

    protected $casts = [
        'retail_price' => 'decimal:2',
        'purchase_price_at_order' => 'decimal:2',
        'qty' => 'integer',
    ];

    public function supplierOrder(): BelongsTo
    {
        return $this->belongsTo(SupplierOrder::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class, 'order_item_id');
    }

    public function supplierVariantOffer(): BelongsTo
    {
        return $this->belongsTo(SupplierVariantOffer::class, 'supplier_variant_offer_id');
    }
}
