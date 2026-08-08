<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSeoBatchItem extends Model
{
    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_APPLIED = 'applied';

    public const STATUS_FAILED = 'failed';

    public const STATUS_SKIPPED = 'skipped';

    protected $fillable = [
        'product_seo_batch_id',
        'product_id',
        'external_id',
        'requested_fields',
        'status',
        'result',
        'applied_fields',
        'error',
    ];

    protected $casts = [
        'requested_fields' => 'array',
        'result' => 'array',
        'applied_fields' => 'array',
    ];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ProductSeoBatch::class, 'product_seo_batch_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
