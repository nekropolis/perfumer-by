<?php

namespace Modules\Loyalty\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Checkout\Models\Order;

class OrderGiftCertificate extends Model
{
    public $timestamps = false;

    protected $table = 'order_gift_certificates';

    protected $fillable = [
        'order_id',
        'gift_certificate_id',
        'code_snapshot',
        'amount_applied',
        'created_at',
    ];

    protected $casts = [
        'amount_applied' => 'decimal:2',
        'created_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function giftCertificate(): BelongsTo
    {
        return $this->belongsTo(GiftCertificate::class, 'gift_certificate_id');
    }
}
