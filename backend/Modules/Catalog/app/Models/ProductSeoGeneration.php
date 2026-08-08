<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSeoGeneration extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_POLLING = 'polling';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CONFLICTED = 'conflicted';

    /** @var list<string> */
    public const ACTIVE_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_SUBMITTED,
        self::STATUS_POLLING,
    ];

    /** @var list<string> */
    public const TERMINAL_STATUSES = [
        self::STATUS_COMPLETED,
        self::STATUS_FAILED,
        self::STATUS_CONFLICTED,
    ];

    protected $fillable = [
        'product_id',
        'active_product_id',
        'external_job_id',
        'status',
        'external_status',
        'requested_fields',
        'source_snapshot',
        'source_hash',
        'result',
        'error',
        'attempts',
        'deadline_at',
        'finished_at',
    ];

    protected $casts = [
        'requested_fields' => 'array',
        'source_snapshot' => 'array',
        'result' => 'array',
        'attempts' => 'integer',
        'deadline_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, self::TERMINAL_STATUSES, true);
    }
}
