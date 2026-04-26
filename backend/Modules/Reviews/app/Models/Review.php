<?php

namespace Modules\Reviews\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

class Review extends Model
{
    public const TYPE_PRODUCT = 'product';

    public const TYPE_STORE = 'store';

    public const STATUS_PENDING = 'pending';

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'type',
        'product_id',
        'name',
        'body',
        'stars',
        'status',
        'published_at',
        'reply_text',
        'replied_at',
    ];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
            'stars' => 'integer',
            'published_at' => 'datetime',
            'replied_at' => 'datetime',
        ];
    }

    public function scopePublished($query)
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
