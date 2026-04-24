<?php

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Loyalty\Models\GiftCertificateTemplate;

class CartGiftCertificateItem extends Model
{
    protected $table = 'cart_gift_certificate_items';

    protected $fillable = [
        'cart_id',
        'template_id',
        'qty',
    ];

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class, 'cart_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(GiftCertificateTemplate::class, 'template_id');
    }
}
