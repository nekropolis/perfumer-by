<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockWriteoff extends Model
{
    protected $fillable = [
        'document_no',
        'warehouse_id',
        'type',
        'order_id',
        'status',
        'written_off_at',
        'comment',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'written_off_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(StockWriteoffItem::class)->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
