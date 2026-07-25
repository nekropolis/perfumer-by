<?php

namespace Modules\Warehouse\Providers;

use Modules\Warehouse\Console\Commands\PurgeStockReceiptCommand;
use Nwidart\Modules\Support\ModuleServiceProvider;

class WarehouseServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Warehouse';

    protected string $nameLower = 'warehouse';

    protected array $providers = [
        RouteServiceProvider::class,
    ];

    protected array $commands = [
        PurgeStockReceiptCommand::class,
    ];
}
