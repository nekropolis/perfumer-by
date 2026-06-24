<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;

class PriceFormula extends Model
{
    public const SOURCE_SUPPLIER = 'supplier';

    public const SOURCE_WAREHOUSE = 'warehouse';

    public const MODE_APPLY_TO_ALL = 'apply_to_all';

    public const MODE_APPLY_WHEN_MATCH = 'apply_when_match';

    public const MODE_SKIP_WHEN_MATCH = 'skip_when_match';

    protected $fillable = [
        'name',
        'source_type',
        'source_id',
        'multiplier',
        'rub_rate',
        'addend',
        'round_precision',
        'variant_rule_mode',
        'variant_rules',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'multiplier' => 'decimal:4',
        'rub_rate' => 'decimal:4',
        'addend' => 'decimal:2',
        'round_precision' => 'integer',
        'variant_rules' => 'array',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];
}
