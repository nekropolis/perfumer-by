<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;

class SellerOneSetting extends Model
{
    protected $fillable = [
        'key',
        'value',
    ];
}
