<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

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
        'seo_title',
        'seo_description',
        'is_active',
        'is_new',
        'is_hit',
        'is_out_of_stock',
        'is_stock_product',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_new' => 'boolean',
        'is_hit' => 'boolean',
        'is_out_of_stock' => 'boolean',
        'is_stock_product' => 'boolean',
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

    public function activeVariants(): HasMany
    {
        return $this->hasMany(ProductVariantLink::class)
            ->where('is_active', true)
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
