<?php

namespace Modules\Warehouse\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class WarehouseServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Warehouse';

    protected string $nameLower = 'warehouse';

    protected array $providers = [
        RouteServiceProvider::class,
    ];
}
