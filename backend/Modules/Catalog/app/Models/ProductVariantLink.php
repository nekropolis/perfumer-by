<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Warehouse\Models\Warehouse;
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

    /**
     * Варианты для витрины: предзаказ, либо активный вариант с каналом отгрузки.
     *
     * @param  Builder<ProductVariantLink>  $query
     */
    public function scopeCatalogListingEligible(Builder $query): void
    {
        $query->where(function (Builder $outer): void {
            $outer->where('is_preorder', true)
                ->orWhere(function (Builder $inner): void {
                    $inner->where('is_active', true)
                        ->where(function (Builder $channel): void {
                            $channel->whereHas('warehouseStocks', function (Builder $stockQuery): void {
                                $stockQuery->whereHas('warehouse', function (Builder $w): void {
                                    $w->whereIn('code', [
                                        Warehouse::CODE_MAIN,
                                        Warehouse::CODE_SUPPLIER,
                                    ]);
                                });
                            })->orWhereHas('supplierOffers', function (Builder $offerQuery): void {
                                $offerQuery->where('supplier_variant_offers.is_active', true)
                                    ->where(function (Builder $p): void {
                                        $p->whereNull('supplier_variant_offers.payload->missing_in_latest_price')
                                            ->orWhere('supplier_variant_offers.payload->missing_in_latest_price', false);
                                    })
                                    ->where(function (Builder $p): void {
                                        $p->whereNull('supplier_variant_offers.payload->seller_one_listing_deferred')
                                            ->orWhere('supplier_variant_offers.payload->seller_one_listing_deferred', false);
                                    })
                                    ->where(function (Builder $p): void {
                                        $p->whereNull('supplier_variant_offers.payload->out_of_stock_in_price_file')
                                            ->orWhere('supplier_variant_offers.payload->out_of_stock_in_price_file', false);
                                    })
                                    ->whereExists(function ($sub): void {
                                        $sub->selectRaw('1')
                                            ->from('supplier_products as sp')
                                            ->whereColumn('sp.supplier_id', 'supplier_variant_offers.supplier_id')
                                            ->whereColumn('sp.product_id', 'product_variant_links.product_id')
                                            ->where('sp.is_linked', '=', true)
                                            ->where('sp.is_active', '=', true)
                                            ->where('sp.link_parsing_active', '=', true);
                                    });
                            });
                        });
                });
        });
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
