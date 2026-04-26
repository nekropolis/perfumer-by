<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\OrderGiftCertificate;

class Order extends Model
{
    protected $table = 'orders';

    protected $fillable = [
        'user_id',
        'cart_token',
        'customer_name',
        'phone',
        'comment',
        'status',
        'items_qty',
        'subtotal',
        'total',
        'delivery_method',
        'delivery_city',
        'delivery_address',
        'delivery_fee',
        'payment_method',
        'gift_certificate_id',
        'gift_certificate_code',
        'gift_certificate_amount',
        'discount_card_id',
        'discount_card_number',
        'discount_percent_snapshot',
        'discount_amount',
    ];

    protected $casts = [
        'delivery_fee' => 'decimal:2',
        'gift_certificate_amount' => 'decimal:2',
    ];

    public function discountCard(): BelongsTo
    {
        return $this->belongsTo(DiscountCard::class, 'discount_card_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    public function orderGiftCertificates(): HasMany
    {
        return $this->hasMany(OrderGiftCertificate::class, 'order_id');
    }

    public function giftCertificatePurchases(): HasMany
    {
        return $this->hasMany(OrderGiftCertificatePurchase::class, 'order_id');
    }

    /** Сертификаты, выпущенные по этому заказу (продажа номинала), включая ожидающие код (status new). */
    public function soldGiftCertificates(): HasMany
    {
        return $this->hasMany(GiftCertificate::class, 'sold_order_id');
    }
}
