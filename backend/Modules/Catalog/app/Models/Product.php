<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Modules\Warehouse\Models\Warehouse;

class Product extends Model
{
    protected $fillable = [
        'brand_id',
        'main_category_id',
        'name',
        'slug',
        'h1',
        'short_description',
        'description',
        'description_rewritten_at',
        'seo_title',
        'seo_description',
        'seo_keyword',
        'is_active',
        'is_new',
        'is_hit',
        'is_out_of_stock',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_new' => 'boolean',
        'is_hit' => 'boolean',
        'is_out_of_stock' => 'boolean',
        'description_rewritten_at' => 'datetime',
    ];

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function mainCategory(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'main_category_id');
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariantLink::class)->orderBy('sort_order');
    }

    /**
     * Варианты для витрины: предзаказ, либо активный вариант с каналом отгрузки
     * (строка на складе main/supplier или канал прайса поставщика — те же условия, что
     * {@see \Modules\Catalog\Support\CatalogVariantStockPresenter::supplierListingActive()}).
     */
    public function activeVariants(): HasMany
    {
        return $this->hasMany(ProductVariantLink::class)
            ->where(function ($query) {
                $query->where('is_preorder', true)
                    ->orWhere(function ($inner) {
                        $inner->where('is_active', true)
                            ->where(function ($channel) {
                                $channel->whereHas('warehouseStocks', function ($stockQuery) {
                                    $stockQuery->whereHas('warehouse', function ($w) {
                                        $w->whereIn('code', [
                                            Warehouse::CODE_MAIN,
                                            Warehouse::CODE_SUPPLIER,
                                        ]);
                                    });
                                })->orWhereHas('supplierOffers', function ($offerQuery) {
                                    $offerQuery->where('supplier_variant_offers.is_active', true)
                                        ->where(function ($p) {
                                            $p->whereNull('supplier_variant_offers.payload->missing_in_latest_price')
                                                ->orWhere('supplier_variant_offers.payload->missing_in_latest_price', false);
                                        })
                                        ->where(function ($p) {
                                            $p->whereNull('supplier_variant_offers.payload->seller_one_listing_deferred')
                                                ->orWhere('supplier_variant_offers.payload->seller_one_listing_deferred', false);
                                        })
                                        ->where(function ($p) {
                                            $p->whereNull('supplier_variant_offers.payload->out_of_stock_in_price_file')
                                                ->orWhere('supplier_variant_offers.payload->out_of_stock_in_price_file', false);
                                        })
                                        ->whereExists(function ($sub) {
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
            })
            ->orderBy('sort_order');
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    public function mainImage(): HasOne
    {
        return $this->hasOne(ProductImage::class)
            ->where('is_main', true);
    }

    public function attributeValues(): HasMany
    {
        return $this->hasMany(ProductAttributeValue::class)->orderBy('sort_order');
    }

    public function supplierProducts(): HasMany
    {
        return $this->hasMany(SupplierProduct::class);
    }
}
