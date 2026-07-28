<?php

namespace Modules\Pages\Providers;

use Modules\Pages\Console\Commands\WarmSeoSitemapCommand;
use Nwidart\Modules\Support\ModuleServiceProvider;

class PagesServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Pages';

    protected string $nameLower = 'pages';

    protected array $providers = [
        RouteServiceProvider::class,
    ];

    protected array $commands = [
        WarmSeoSitemapCommand::class,
    ];
}
