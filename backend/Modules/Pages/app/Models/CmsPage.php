<?php

namespace Modules\Pages\Models;

use Illuminate\Database\Eloquent\Model;

class CmsPage extends Model
{
    protected $table = 'cms_pages';

    protected $fillable = [
        'name',
        'slug',
        'h1',
        'content',
        'seo_title',
        'seo_description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
