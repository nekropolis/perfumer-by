<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;

class ProductViewSnapshot extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $table = 'product_view_snapshots';

    protected $primaryKey = null;

    protected $fillable = [
        'snapshot_on',
        'position',
        'product_id',
    ];

    protected $casts = [
        'snapshot_on' => 'date',
        'position' => 'integer',
        'product_id' => 'integer',
    ];
}
