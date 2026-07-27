<?php

namespace Modules\ImportExport\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Catalog\Models\Product;

class AllparfumeProduct extends Model
{
    protected $fillable = [
        'brand_slug',
        'brand_name',
        'external_slug',
        'source_url',
        'source_url_hash',
        'title',
        'name',
        'gender_label',
        'listing_min_price',
        'listing_max_price',
        'product_id',
        'match_status',
        'match_confidence',
        'match_payload',
        'last_crawled_at',
        'payload',
    ];

    protected $casts = [
        'listing_min_price' => 'decimal:2',
        'listing_max_price' => 'decimal:2',
        'match_payload' => 'array',
        'payload' => 'array',
        'last_crawled_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(AllparfumeVariant::class);
    }

    public function shopOffers(): HasMany
    {
        return $this->hasMany(AllparfumeShopOffer::class);
    }
}
