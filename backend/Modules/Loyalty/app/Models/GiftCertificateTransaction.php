<?php

namespace Modules\Loyalty\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Checkout\Models\Order;

class GiftCertificateTransaction extends Model
{
    public const TYPE_ISSUE = 'issue';

    public const TYPE_RESERVE = 'reserve';

    public const TYPE_RELEASE = 'release';

    public const TYPE_DEBIT = 'debit';

    public const TYPE_REFUND = 'refund';

    public $timestamps = false;

    protected $table = 'gift_certificate_transactions';

    protected $fillable = [
        'gift_certificate_id',
        'type',
        'amount',
        'balance_before',
        'balance_after',
        'order_id',
        'cart_token',
        'meta',
        'created_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'balance_before' => 'decimal:2',
        'balance_after' => 'decimal:2',
        'meta' => 'array',
        'created_at' => 'datetime',
    ];

    public function giftCertificate(): BelongsTo
    {
        return $this->belongsTo(GiftCertificate::class, 'gift_certificate_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }
}
