<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Loyalty\Models\GiftCertificateTemplate;

class OrderGiftCertificatePurchase extends Model
{
    public $timestamps = false;

    protected $table = 'order_gift_certificate_purchases';

    protected $fillable = [
        'order_id',
        'template_id',
        'template_title',
        'amount',
        'qty',
        'total',
        'created_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'total' => 'decimal:2',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(GiftCertificateTemplate::class, 'template_id');
    }
}
