<?php

namespace Modules\ImportExport\Models;

use Illuminate\Database\Eloquent\Model;

class AllparfumeShop extends Model
{
    protected $fillable = [
        'shop_key',
        'shop_name',
        'shop_url',
        'is_active',
        'offers_count',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'offers_count' => 'integer',
    ];
}
