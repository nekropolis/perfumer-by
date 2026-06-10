<?php

namespace Modules\Communications\Providers;

use Modules\Communications\Console\Commands\ServerHealthReportCommand;
use Nwidart\Modules\Support\ModuleServiceProvider;

class CommunicationsServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Communications';

    protected string $nameLower = 'communications';

    protected array $providers = [
        RouteServiceProvider::class,
    ];

    protected array $commands = [
        ServerHealthReportCommand::class,
    ];
}
