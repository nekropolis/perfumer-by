<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;

class StockReceiptImportMapping extends Model
{
    protected $table = 'stock_receipt_import_mappings';

    protected $fillable = [
        'supplier_sku',
        'source_title',
        'product_id',
        'variant_id',
        'created_by',
        'updated_by',
    ];
}

