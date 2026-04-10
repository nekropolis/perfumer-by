<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierPriceHistory extends Model
{
    protected $fillable = [
        'supplier_variant_offer_id',
        'price',
        'old_price',
        'stock',
        'captured_at',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'old_price' => 'decimal:2',
        'captured_at' => 'datetime',
    ];

    public function supplierVariantOffer(): BelongsTo
    {
        return $this->belongsTo(SupplierVariantOffer::class);
    }
}
