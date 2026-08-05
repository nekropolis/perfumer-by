<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Catalog\Models\Supplier;

class SupplierOrder extends Model
{
    public const STATUS_DRAFT = 'draft';

    public const STATUS_CONFIRMED = 'confirmed';

    protected $table = 'supplier_orders';

    protected $fillable = [
        'number',
        'supplier_id',
        'status',
        'ordered_at',
        'items_qty',
        'total',
    ];

    protected $casts = [
        'ordered_at' => 'datetime',
        'total' => 'decimal:2',
        'items_qty' => 'integer',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /**
     * @return HasMany<int, SupplierOrderItem>
     */
    public function items(): HasMany
    {
        return $this->hasMany(SupplierOrderItem::class, 'supplier_order_id');
    }

    public function scopeDraft(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_DRAFT);
    }

    public function scopeConfirmed(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_CONFIRMED);
    }

    public function recalculateTotals(): void
    {
        $items = $this->relationLoaded('items')
            ? $this->items
            : $this->items()->get();

        $qty = 0;
        $total = 0.0;
        foreach ($items as $item) {
            $lineQty = (int) $item->qty;
            $qty += $lineQty;
            if ($item->purchase_price_at_order !== null) {
                $total += ((float) $item->purchase_price_at_order) * $lineQty;
            }
        }

        $this->forceFill([
            'items_qty' => $qty,
            'total' => round($total, 2),
        ])->save();
    }
}
