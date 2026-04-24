<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierProduct extends Model
{
    protected $fillable = [
        'supplier_id',
        'brand_id',
        'product_id',
        'external_name',
        'external_slug',
        'external_url',
        'is_linked',
        'is_active',
        'link_parsing_active',
        'last_seen_at',
        'payload',
    ];

    protected $casts = [
        'is_linked' => 'boolean',
        'is_active' => 'boolean',
        'link_parsing_active' => 'boolean',
        'last_seen_at' => 'datetime',
        'payload' => 'array',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
