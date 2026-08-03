<?php

namespace Modules\Loyalty\Models;

use Modules\Users\Models\Client;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiscountCard extends Model
{
    /** Максимальный процент скидки по накопительной карте (включительно). */
    public const MAX_DISCOUNT_PERCENT = 10.0;

    /** Максимальный процент при ручной установке скидки (включительно). */
    public const MAX_MANUAL_DISCOUNT_PERCENT = 20.0;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_BLOCKED = 'blocked';

    public const STATUS_EXPIRED = 'expired';

    /**
     * Ограничение процента для витрины и корзины (защита от устаревших данных в БД).
     */
    public static function effectiveDiscountPercent(float $stored, bool $isManualDiscount = false): float
    {
        $max = $isManualDiscount ? self::MAX_MANUAL_DISCOUNT_PERCENT : self::MAX_DISCOUNT_PERCENT;

        return min($max, max(0.0, round($stored, 2)));
    }

    public function resolvedDiscountPercent(): float
    {
        return self::effectiveDiscountPercent(
            (float) $this->discount_percent,
            (bool) $this->is_manual_discount
        );
    }

    protected $table = 'discount_cards';

    protected $fillable = [
        'card_number',
        'discount_percent',
        'is_manual_discount',
        'status',
        'issued_at',
        'owner_name',
        'phone',
        'notes',
        'spent_total',
        'last_order_completed_at',
    ];

    protected $casts = [
        'discount_percent' => 'decimal:2',
        'is_manual_discount' => 'boolean',
        'spent_total' => 'decimal:2',
        'issued_at' => 'datetime',
        'last_order_completed_at' => 'datetime',
    ];

    public function isUsableInOrder(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function clients(): BelongsToMany
    {
        return $this->belongsToMany(Client::class, 'client_discount_cards', 'discount_card_id', 'client_id')
            ->using(ClientDiscountCard::class)
            ->withPivot(['linked_at', 'verified_at', 'is_primary', 'source', 'link_status'])
            ->withTimestamps();
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(DiscountCardTransaction::class, 'discount_card_id');
    }
}
