<?php

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cart extends Model
{
    /**
     * Значение discount_card_number: пользователь убрал карту из корзины;
     * не подставлять привязанную карту из профиля до следующего явного «Применить».
     */
    public const DISCOUNT_CARD_SUPPRESS_PROFILE_MARKER = '__profile_discount_suppressed__';

    protected $table = 'carts';

    protected $fillable = [
        'token',
        'user_id',
        'gift_certificate_code',
        'discount_card_number',
        'discount_card_session_only',
    ];

    protected $casts = [
        'discount_card_session_only' => 'boolean',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(CartItem::class, 'cart_id');
    }

    public function giftCertificateItems(): HasMany
    {
        return $this->hasMany(CartGiftCertificateItem::class, 'cart_id');
    }
}
