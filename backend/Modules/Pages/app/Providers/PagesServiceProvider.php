<?php

namespace Modules\Pages\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class PagesServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Pages';

    protected string $nameLower = 'pages';

    protected array $providers = [
        RouteServiceProvider::class,
    ];
}
