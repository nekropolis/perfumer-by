<?php

namespace Modules\Loyalty\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;
use Modules\Users\Models\Client;

class ClientDiscountCard extends Pivot
{
    public const SOURCE_MANAGER = 'manager';

    public const SOURCE_REGISTRATION = 'registration';

    public const LINK_VERIFIED = 'verified';

    public const LINK_PENDING_CONFLICT = 'pending_conflict';

    public const LINK_REJECTED = 'rejected';

    protected $table = 'client_discount_cards';

    public $incrementing = true;

    protected $fillable = [
        'client_id',
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

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }

    public function discountCard(): BelongsTo
    {
        return $this->belongsTo(DiscountCard::class, 'discount_card_id');
    }
}
