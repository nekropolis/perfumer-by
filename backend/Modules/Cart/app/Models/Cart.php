<?php

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cart extends Model
{
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
