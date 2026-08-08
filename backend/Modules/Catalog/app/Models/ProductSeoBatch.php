<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductSeoBatch extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'external_batch_id',
        'status',
        'requested_count',
        'accepted_count',
        'queued_count',
        'applied_count',
        'failed_count',
        'force',
        'response',
        'error',
        'submitted_at',
        'finished_at',
    ];

    protected $casts = [
        'requested_count' => 'integer',
        'accepted_count' => 'integer',
        'queued_count' => 'integer',
        'applied_count' => 'integer',
        'failed_count' => 'integer',
        'force' => 'boolean',
        'response' => 'array',
        'submitted_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(ProductSeoBatchItem::class, 'product_seo_batch_id');
    }
}
