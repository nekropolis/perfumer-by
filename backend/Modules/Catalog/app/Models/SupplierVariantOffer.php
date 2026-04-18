<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupplierVariantOffer extends Model
{
    protected $fillable = [
        'supplier_id',
        'product_variant_id',
        'external_product_url',
        'external_product_name',
        'external_variant_name',
        'external_id',
        'sku',
        'price',
        'old_price',
        'purchase_price',
        'stock',
        'is_preorder',
        'is_active',
        'last_seen_at',
        'last_synced_at',
        'payload',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'old_price' => 'decimal:2',
        'purchase_price' => 'decimal:2',
        'is_preorder' => 'boolean',
        'is_active' => 'boolean',
        'last_seen_at' => 'datetime',
        'last_synced_at' => 'datetime',
        'payload' => 'array',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function productVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'product_variant_id');
    }

    public function priceHistories(): HasMany
    {
        return $this->hasMany(SupplierPriceHistory::class);
    }

    public function getDiscountPercentAttribute(): ?int
    {
        if (!$this->old_price || $this->old_price <= $this->price) {
            return null;
        }

        return (int) round((($this->old_price - $this->price) / $this->old_price) * 100);
    }
}
