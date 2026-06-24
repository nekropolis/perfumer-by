<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Supplier extends Model
{
    public const CODE_VANILLE = 'vanille';

    /** Поставщики, не участвующие в пересчёте цен по прайсу. */
    private const PRICING_EXCLUDED_CODES = [
        self::CODE_VANILLE,
    ];

    protected $fillable = [
        'name',
        'code',
        'base_url',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function variantOffers(): HasMany
    {
        return $this->hasMany(SupplierVariantOffer::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(SupplierProduct::class);
    }

    public function scopeForPricing(Builder $query): Builder
    {
        return $query->whereNotIn('code', self::PRICING_EXCLUDED_CODES);
    }

    public function participatesInPricing(): bool
    {
        return !in_array((string) $this->code, self::PRICING_EXCLUDED_CODES, true);
    }
}
