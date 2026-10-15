<?php

namespace Modules\Pages\Models;

use Illuminate\Database\Eloquent\Model;

class CmsPage extends Model
{
    /** Slug CMS-страницы главной (контент для `/`); `/glavnaya` и `/home` редиректят на `/`. */
    public const HOME_SLUG = 'glavnaya';

    /** @var list<string> */
    public const HOME_ALIAS_SLUGS = [self::HOME_SLUG, 'home'];

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
