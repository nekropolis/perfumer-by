<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Warehouse\Models\WarehouseVariantStock;

class ProductVariantLink extends Model
{
    protected $table = 'product_variant_links';

    protected $appends = [
        'title',
        'display_name',
        'volume',
        'volume_unit',
        'concentration',
        'type',
        'edition',
        'available_stock',
    ];

    protected $fillable = [
        'product_id',
        'variant_definition_id',
        'price',
        'old_price',
        'stock',
        'reserved_stock',
        'is_preorder',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'old_price' => 'decimal:2',
        'reserved_stock' => 'integer',
        'is_preorder' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function definition(): BelongsTo
    {
        return $this->belongsTo(VariantDefinition::class, 'variant_definition_id');
    }

    public function supplierOffers(): HasMany
    {
        return $this->hasMany(SupplierVariantOffer::class, 'product_variant_id');
    }

    public function warehouseStocks(): HasMany
    {
        return $this->hasMany(WarehouseVariantStock::class, 'variant_id');
    }

    public function getTitleAttribute(): string
    {
        return (string) ($this->definition?->title ?? '');
    }

    public function getDisplayNameAttribute(): string
    {
        return $this->title;
    }

    public function getVolumeAttribute(): ?int
    {
        return $this->definition?->volume_ml;
    }

    public function getVolumeUnitAttribute(): ?string
    {
        return $this->definition ? 'мл' : null;
    }

    public function getConcentrationAttribute(): ?string
    {
        return $this->definition?->concentration_code;
    }

    public function getTypeAttribute(): ?string
    {
        return $this->definition?->concentration_label;
    }

    public function getEditionAttribute(): ?string
    {
        if ($this->definition?->is_tester) {
            return 'Тестер';
        }

        if ($this->definition?->is_vial) {
            return 'Пробник';
        }

        return null;
    }

    public function getDiscountPercentAttribute(): ?int
    {
        if (!$this->old_price || $this->old_price <= $this->price) {
            return null;
        }

        return (int) round((($this->old_price - $this->price) / $this->old_price) * 100);
    }

    public function getAvailableStockAttribute(): int
    {
        return max(0, (int) $this->stock - (int) $this->reserved_stock);
    }
}
