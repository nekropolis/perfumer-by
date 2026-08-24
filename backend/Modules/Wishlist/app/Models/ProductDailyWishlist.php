<?php

namespace Modules\Wishlist\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

class ProductDailyWishlist extends Model
{
    protected $fillable = [
        'product_id',
        'wished_on',
        'wishlists_count',
    ];

    protected $casts = [
        'wished_on' => 'date',
        'wishlists_count' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
