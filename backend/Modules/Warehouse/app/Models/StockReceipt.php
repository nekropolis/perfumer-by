<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Catalog\Models\Supplier;

class StockReceipt extends Model
{
    protected $fillable = [
        'document_no',
        'warehouse_id',
        'supplier_id',
        'supplier_code',
        'supplier_name',
        'status',
        'received_at',
        'comment',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'received_at' => 'datetime',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(StockReceiptItem::class)->orderBy('id');
    }
}
