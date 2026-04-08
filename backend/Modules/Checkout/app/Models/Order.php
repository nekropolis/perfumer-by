<?php

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $table = 'orders';

    protected $fillable = [
        'user_id',
        'cart_token',
        'customer_name',
        'phone',
        'comment',
        'status',
        'items_qty',
        'subtotal',
        'total',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }
}
