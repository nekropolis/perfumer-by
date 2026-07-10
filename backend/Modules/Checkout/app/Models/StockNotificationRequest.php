<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

class StockNotificationRequest extends Model
{
    protected $table = 'stock_notification_requests';

    public const KIND_BACK_IN_STOCK = 'back_in_stock';
    public const KIND_CALLBACK = 'callback';

    public const ALLOWED_KINDS = [
        self::KIND_BACK_IN_STOCK,
        self::KIND_CALLBACK,
    ];

    protected $fillable = [
        'kind',
        'client_id',
        'product_id',
        'variant_id',
        'product_name',
        'variant_title',
        'phone',
        'comment',
        'status',
        'notified_at',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'notified_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariantLink::class, 'variant_id');
    }
}
