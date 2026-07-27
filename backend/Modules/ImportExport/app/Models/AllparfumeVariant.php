<?php

namespace Modules\ImportExport\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Catalog\Models\ProductVariantLink;

class AllparfumeVariant extends Model
{
    protected $fillable = [
        'allparfume_product_id',
        'variant_key',
        'raw_label',
        'volume_ml',
        'concentration_code',
        'is_tester',
        'is_vial',
        'is_miniature',
        'min_price',
        'product_variant_link_id',
        'match_status',
        'match_confidence',
        'match_payload',
        'last_crawled_at',
        'payload',
    ];

    protected $casts = [
        'volume_ml' => 'decimal:1',
        'is_tester' => 'boolean',
        'is_vial' => 'boolean',
        'is_miniature' => 'boolean',
        'min_price' => 'decimal:2',
        'match_payload' => 'array',
        'payload' => 'array',
        'last_crawled_at' => 'datetime',
    ];

    public function allparfumeProduct(): BelongsTo
    {
        return $this->belongsTo(AllparfumeProduct::class);
    }

    public function productVariantLink(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'product_variant_link_id');
    }

    public function shopOffers(): HasMany
    {
        return $this->hasMany(AllparfumeShopOffer::class);
    }
}
