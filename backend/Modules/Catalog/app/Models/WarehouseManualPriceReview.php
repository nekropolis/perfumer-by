<?php

namespace Modules\Catalog\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WarehouseManualPriceReview extends Model
{
    public const REASON_NO_RECEIPT_SUPPLIER = 'no_receipt_supplier';

    public const REASON_NO_SUPPLIER_MATCH = 'no_supplier_match';

    public const REASON_WAREHOUSE_NOT_LOWER = 'warehouse_not_lower';

    public const REASON_WAREHOUSE_OFFER_GAP = 'warehouse_offer_gap';

    public const REASON_WAREHOUSE_BLEND_GAP = 'warehouse_blend_gap';

    public const REASON_ALLPARFUME_NO_MATCH = 'allparfume_no_match';

    public const REASON_ALLPARFUME_NO_INPUT = 'allparfume_no_input';

    protected $fillable = [
        'variant_id',
        'product_id',
        'reason',
        'warehouse_purchase',
        'supplier_purchase',
        'receipt_supplier_id',
        'supplier_sku',
        'supplier_external_code',
        'product_name',
        'variant_title',
        'manual_retail_price',
        'list_on_storefront',
        'manual_set_by',
        'manual_set_at',
        'price_refresh_run_id',
        'resolved_at',
    ];

    protected $casts = [
        'warehouse_purchase' => 'decimal:2',
        'supplier_purchase' => 'decimal:2',
        'manual_retail_price' => 'decimal:2',
        'list_on_storefront' => 'boolean',
        'manual_set_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'variant_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function receiptSupplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'receipt_supplier_id');
    }

    public function manualSetBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manual_set_by');
    }

    public function priceRefreshRun(): BelongsTo
    {
        return $this->belongsTo(PriceRefreshRun::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('resolved_at');
    }
}
