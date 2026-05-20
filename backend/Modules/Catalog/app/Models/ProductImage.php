<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductImage extends Model
{
    public const USAGE_GALLERY = 'gallery';

    public const USAGE_CATALOG = 'catalog';

    public const WATERMARK_NONE = 'none';

    public const WATERMARK_DETECTED = 'detected';

    public const WATERMARK_CROPPED = 'cropped';

    public const WATERMARK_NEEDS_REVIEW = 'needs_review';

    protected $fillable = [
        'product_id',
        'path',
        'path_full',
        'path_card',
        'path_listing',
        'path_thumb',
        'alt',
        'sort_order',
        'is_main',
        'usage_type',
        'source_url',
        'watermark_status',
        'watermark_meta',
    ];

    protected $casts = [
        'is_main' => 'boolean',
        'watermark_meta' => 'array',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
