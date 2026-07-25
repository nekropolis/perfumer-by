<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockReceiptImportRow extends Model
{
    public const RESOLVE_PENDING = 'pending';

    public const RESOLVE_MATCHED = 'matched';

    public const RESOLVE_UNMATCHED = 'unmatched';

    public const RECEIPT_PENDING = 'pending';

    public const RECEIPT_IN_RECEIPT = 'in_receipt';

    protected $table = 'stock_receipt_import_rows';

    protected $fillable = [
        'import_id',
        'map_key',
        'supplier_sku',
        'source_title',
        'qty',
        'supplier_price',
        'variant_id',
        'product_id',
        'resolve_status',
        'suggestion',
        'receipt_status',
        'stock_receipt_id',
        'stock_receipt_item_id',
        'linked_by',
        'committed_by',
        'committed_at',
    ];

    protected $casts = [
        'suggestion' => 'array',
        'supplier_price' => 'decimal:2',
        'committed_at' => 'datetime',
    ];

    public function import(): BelongsTo
    {
        return $this->belongsTo(StockReceiptImport::class, 'import_id');
    }

    public function stockReceipt(): BelongsTo
    {
        return $this->belongsTo(StockReceipt::class, 'stock_receipt_id');
    }
}
