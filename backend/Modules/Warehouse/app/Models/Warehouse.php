<?php

namespace Modules\Warehouse\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warehouse extends Model
{
    public const CODE_MAIN = 'main';
    public const CODE_SUPPLIER = 'supplier';

    protected $fillable = [
        'code',
        'name',
        'is_active',
        'is_default',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_default' => 'boolean',
    ];

    public function variantStocks(): HasMany
    {
        return $this->hasMany(WarehouseVariantStock::class);
    }
}
