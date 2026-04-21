<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;

class StockReceiptImportSessionState extends Model
{
    protected $table = 'stock_receipt_import_session_states';

    protected $fillable = [
        'user_id',
        'session_id',
        'warehouse_id',
        'supplier_id',
        'received_at',
        'comment',
        'parsed_total_rows',
        'linked_draft_receipt_id',
        'unresolved',
        'mapping_by_key',
    ];

    protected $casts = [
        'unresolved' => 'array',
        'mapping_by_key' => 'array',
    ];
}

