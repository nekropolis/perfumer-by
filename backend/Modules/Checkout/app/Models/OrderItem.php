<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierVariantOffer;

class OrderItem extends Model
{
    protected $table = 'order_items';

    protected $fillable = [
        'order_id',
        'product_id',
        'variant_id',
        'product_name',
        'product_slug',
        'brand_name',
        'variant_title',
        'sku',
        'qty',
        'price',
        'total',
        'waiting_discount',
        'availability_source',
        'stock_lot_allocations',
        'supplier_variant_offer_id',
        'supplier_purchase_price',
    ];

    protected $casts = [
        'waiting_discount' => 'boolean',
        'stock_lot_allocations' => 'array',
        'supplier_purchase_price' => 'decimal:2',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'variant_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function supplierVariantOffer(): BelongsTo
    {
        return $this->belongsTo(SupplierVariantOffer::class, 'supplier_variant_offer_id');
    }
}
