<?php

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Modules\Catalog\Casts\CatalogLandingFiltersCast;

class CatalogLanding extends Model
{
    protected $table = 'catalog_landings';

    protected $fillable = [
        'slug',
        'gender',
        'filters',
        'h1',
        'seo_title',
        'seo_description',
        'content',
        'is_active',
        'sort',
    ];

    protected $casts = [
        'filters' => CatalogLandingFiltersCast::class,
        'is_active' => 'boolean',
        'sort' => 'integer',
    ];
}
