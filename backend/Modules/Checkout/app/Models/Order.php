<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\OrderGiftCertificate;
use Modules\Users\Models\Client;

class Order extends Model
{
    protected $table = 'orders';

    protected $fillable = [
        'client_id',
        'cart_token',
        'customer_name',
        'phone',
        'comment',
        'manager_comment',
        'status',
        'items_qty',
        'subtotal',
        'total',
        'delivery_method',
        'delivery_city',
        'delivery_city_id',
        'delivery_address',
        'delivery_street_prefix',
        'delivery_house',
        'delivery_korpus',
        'delivery_apartment',
        'delivery_comment',
        'shipment_id',
        'shipment_status',
        'shipment_status_at',
        'shipment_date',
        'delivery_date',
        'delivery_time_from',
        'delivery_time_to',
        'delivery_fee',
        'payment_method',
        'consent_offer',
        'consent_privacy',
        'consent_marketing',
        'consents_accepted_at',
        'discount_card_id',
        'discount_card_number',
        'discount_percent_snapshot',
        'discount_amount',
    ];

    protected $casts = [
        'shipment_date' => 'date',
        'delivery_date' => 'date',
        'delivery_fee' => 'decimal:2',
        'shipment_status_at' => 'datetime',
        'consent_offer' => 'boolean',
        'consent_privacy' => 'boolean',
        'consent_marketing' => 'boolean',
        'consents_accepted_at' => 'datetime',
    ];

    /** Списание подарочного сертификата: только `order_gift_certificates` (колонки на `orders` сняты в v2 миграции). */
    public function resolvedGiftCertificateAmountApplied(): float
    {
        if (isset($this->attributes['gift_certificate_amount']) && $this->attributes['gift_certificate_amount'] !== null) {
            return round((float) $this->attributes['gift_certificate_amount'], 2);
        }

        $lines = $this->relationLoaded('orderGiftCertificates')
            ? $this->orderGiftCertificates
            : $this->orderGiftCertificates()->get();

        return round((float) $lines->sum('amount_applied'), 2);
    }

    public function discountCard(): BelongsTo
    {
        return $this->belongsTo(DiscountCard::class, 'discount_card_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(OrderTag::class, 'order_order_tag');
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
