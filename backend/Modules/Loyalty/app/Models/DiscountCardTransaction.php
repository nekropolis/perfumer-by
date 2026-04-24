<?php

namespace Modules\Loyalty\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiscountCardTransaction extends Model
{
    protected $table = 'discount_card_transactions';

    protected $fillable = [
        'discount_card_id',
        'order_id',
        'type',
        'order_subtotal',
        'discount_percent_before',
        'discount_percent_after',
        'percent_increment',
    ];

    protected $casts = [
        'order_subtotal' => 'decimal:2',
        'discount_percent_before' => 'decimal:2',
        'discount_percent_after' => 'decimal:2',
        'percent_increment' => 'decimal:2',
    ];

    public function discountCard(): BelongsTo
    {
        return $this->belongsTo(DiscountCard::class, 'discount_card_id');
    }
}
