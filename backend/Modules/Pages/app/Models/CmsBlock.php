<?php

namespace Modules\Pages\Models;

use Illuminate\Database\Eloquent\Model;

class CmsBlock extends Model
{
    protected $table = 'cms_blocks';

    protected $fillable = [
        'name',
        'code',
        'content',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
