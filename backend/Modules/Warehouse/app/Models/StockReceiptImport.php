<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockReceiptImport extends Model
{
    public const STATUS_OPEN = 'open';

    public const STATUS_CLOSED = 'closed';

    protected $table = 'stock_receipt_imports';

    protected $fillable = [
        'uuid',
        'content_hash',
        'original_filename',
        'file_path',
        'warehouse_id',
        'supplier_id',
        'received_at',
        'comment',
        'status',
        'target_stock_receipt_id',
        'created_by',
    ];

    protected $casts = [
        'received_at' => 'datetime',
    ];

    public function rows(): HasMany
    {
        return $this->hasMany(StockReceiptImportRow::class, 'import_id')->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function targetReceipt(): BelongsTo
    {
        return $this->belongsTo(StockReceipt::class, 'target_stock_receipt_id');
    }
}
