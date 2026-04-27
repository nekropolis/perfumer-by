<?php

namespace Modules\Pages\Models;

use Illuminate\Database\Eloquent\Model;

class CmsPost extends Model
{
    public const TYPE_NEWS = 'news';
    public const TYPE_ARTICLE = 'article';

    protected $table = 'cms_posts';

    protected $fillable = [
        'is_active',
        'title',
        'type',
        'cover_image',
        'excerpt',
        'content',
        'seo_title',
        'seo_description',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
