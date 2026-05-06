<?php

namespace Modules\ImportExport\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

class ImportRetryItem extends Model
{
    protected $table = 'import_retry_queue';

    public const TASK_VANILLE_CATALOG_IMAGES = 'vanille_catalog_images';

    public const TASK_VANILLE_PRODUCT_IMAGES = 'vanille_product_images';

    public const TASK_DESCRIPTION_REWRITE = 'description_rewrite';

    public const STATUS_PENDING = 'pending';

    public const STATUS_RESOLVED = 'resolved';

    public const STATUS_DISMISSED = 'dismissed';

    protected $fillable = [
        'task_type',
        'product_id',
        'status',
        'attempts',
        'last_error',
        'last_attempt_at',
        'payload',
    ];

    protected $casts = [
        'last_attempt_at' => 'datetime',
        'payload' => 'array',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
