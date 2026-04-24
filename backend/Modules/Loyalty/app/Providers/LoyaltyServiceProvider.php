<?php

namespace Modules\Loyalty\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class LoyaltyServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Loyalty';

    protected string $nameLower = 'loyalty';

    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];
}

