<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Modules\Catalog\Models\ProductSet as CatalogProductSet;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;

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
        'is_set',
        'is_out_of_stock',
        'listing_min_price',
        'listing_max_price',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_new' => 'boolean',
        'is_hit' => 'boolean',
        'is_set' => 'boolean',
        'is_out_of_stock' => 'boolean',
        'listing_min_price' => 'decimal:2',
        'listing_max_price' => 'decimal:2',
        'description_rewritten_at' => 'datetime',
    ];

    protected function displayName(): Attribute
    {
        return Attribute::get(fn (): string => ProductDisplayName::forProduct($this));
    }

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

    public function sets(): HasMany
    {
        return $this->hasMany(CatalogProductSet::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * Варианты для витрины: предзаказ, либо активный вариант с каналом отгрузки
     * (строка на складе main/supplier или канал прайса поставщика — те же условия, что
     * {@see CatalogVariantStockPresenter::supplierListingActive()}).
     */
    public function activeVariants(): HasMany
    {
        return $this->hasMany(ProductVariantLink::class)
            ->catalogListingEligible()
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

    public function seoGenerations(): HasMany
    {
        return $this->hasMany(ProductSeoGeneration::class);
    }

    public function seoFieldReceipts(): HasMany
    {
        return $this->hasMany(ProductSeoFieldReceipt::class);
    }

    public function seoBatchItems(): HasMany
    {
        return $this->hasMany(ProductSeoBatchItem::class);
    }
}
