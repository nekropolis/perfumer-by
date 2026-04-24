<?php

namespace Modules\Loyalty\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

class UserDiscountCard extends Pivot
{
    public const LINK_PENDING = 'pending';

    public const LINK_VERIFIED = 'verified';

    public const LINK_REJECTED = 'rejected';

    public const LINK_REVOKED = 'revoked';

    public const LINK_PENDING_CONFLICT = 'pending_conflict';

    public const SOURCE_REGISTRATION = 'registration';

    public const SOURCE_ORDER = 'order';

    public const SOURCE_MANAGER = 'manager';

    public const SOURCE_IMPORT = 'import';

    protected $table = 'user_discount_cards';

    protected $fillable = [
        'user_id',
        'discount_card_id',
        'linked_at',
        'verified_at',
        'is_primary',
        'source',
        'link_status',
    ];

    protected $casts = [
        'linked_at' => 'datetime',
        'verified_at' => 'datetime',
        'is_primary' => 'boolean',
    ];

    public function discountCard(): BelongsTo
    {
        return $this->belongsTo(DiscountCard::class, 'discount_card_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(\Modules\Users\Models\User::class, 'user_id');
    }
}
