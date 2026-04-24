<?php

namespace Modules\Loyalty\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Checkout\Models\Order;
use Modules\Users\Models\User;

class GiftCertificate extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_USED = 'used';

    public const STATUS_REDEEMED = 'redeemed';

    public const STATUS_VOID = 'void';

    public const STATUS_EXPIRED = 'expired';

    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_SOLD = 'sold';

    public $timestamps = false;

    protected $table = 'gift_certificates';

    protected $fillable = [
        'template_id',
        'code',
        'initial_amount',
        'balance_amount',
        'reserved_amount',
        'status',
        'source',
        'expires_at',
        'sold_order_id',
        'issued_to_user_id',
        'issued_phone',
        'comment',
        'issued_at',
        'activated_at',
        'purchaser_user_id',
        'created_at',
    ];

    protected $casts = [
        'initial_amount' => 'decimal:2',
        'balance_amount' => 'decimal:2',
        'reserved_amount' => 'decimal:2',
        'expires_at' => 'datetime',
        'issued_at' => 'datetime',
        'activated_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    protected $appends = [
        'number',
    ];

    public function transactions(): HasMany
    {
        return $this->hasMany(GiftCertificateTransaction::class, 'gift_certificate_id');
    }

    public function orderApplications(): HasMany
    {
        return $this->hasMany(OrderGiftCertificate::class, 'gift_certificate_id');
    }

    public function soldOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'sold_order_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(GiftCertificateTemplate::class, 'template_id');
    }

    public function purchaser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'purchaser_user_id');
    }

    public function issuedToUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_to_user_id');
    }

    /**
     * Совместимость с админкой/JSON: «номер» = код.
     */
    public function getNumberAttribute(): string
    {
        return (string) ($this->attributes['code'] ?? '');
    }
}
