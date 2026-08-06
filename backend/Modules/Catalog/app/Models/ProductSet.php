<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductSet extends Model
{
    protected $fillable = [
        'product_id',
        'product_variant_link_id',
        'title',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variantLink(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'product_variant_link_id');
    }

    public function components(): HasMany
    {
        return $this->hasMany(ProductSetComponent::class)->orderBy('sort_order')->orderBy('id');
    }
}
