<?php

namespace Modules\Reviews\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class ReviewsServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Reviews';

    protected string $nameLower = 'reviews';

    protected array $providers = [
        RouteServiceProvider::class,
    ];
}
