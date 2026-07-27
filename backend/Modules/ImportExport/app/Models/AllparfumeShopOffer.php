<?php

namespace Modules\ImportExport\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AllparfumeShopOffer extends Model
{
    protected $fillable = [
        'allparfume_product_id',
        'allparfume_variant_id',
        'shop_key',
        'shop_name',
        'shop_url',
        'offer_url',
        'offer_url_hash',
        'price',
        'old_price',
        'delivery_text',
        'is_active',
        'include_in_pricing',
        'last_seen_at',
        'payload',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'old_price' => 'decimal:2',
        'is_active' => 'boolean',
        'include_in_pricing' => 'boolean',
        'last_seen_at' => 'datetime',
        'payload' => 'array',
    ];

    public function allparfumeProduct(): BelongsTo
    {
        return $this->belongsTo(AllparfumeProduct::class);
    }

    public function allparfumeVariant(): BelongsTo
    {
        return $this->belongsTo(AllparfumeVariant::class);
    }
}
