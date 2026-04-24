<?php

namespace Modules\Loyalty\Models;

use Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiscountCard extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_BLOCKED = 'blocked';

    public const STATUS_EXPIRED = 'expired';

    protected $table = 'discount_cards';

    protected $fillable = [
        'card_number',
        'discount_percent',
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
        'spent_total' => 'decimal:2',
        'issued_at' => 'datetime',
        'last_order_completed_at' => 'datetime',
    ];

    public function isUsableInOrder(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_discount_cards', 'discount_card_id', 'user_id')
            ->using(UserDiscountCard::class)
            ->withPivot(['linked_at', 'verified_at', 'is_primary', 'source', 'link_status'])
            ->withTimestamps();
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(DiscountCardTransaction::class, 'discount_card_id');
    }
}
