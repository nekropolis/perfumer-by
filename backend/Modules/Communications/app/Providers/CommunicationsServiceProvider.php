<?php

namespace Modules\Communications\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class CommunicationsServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Communications';

    protected string $nameLower = 'communications';

    protected array $providers = [
        RouteServiceProvider::class,
    ];
}
