<?php

namespace Modules\Settings\Providers;

use Modules\Settings\Console\Commands\AdvanceWaitingDiscountDeliveryDateCommand;
use Nwidart\Modules\Support\ModuleServiceProvider;

class SettingsServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'Settings';

    protected string $nameLower = 'settings';

    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    protected array $commands = [
        AdvanceWaitingDiscountDeliveryDateCommand::class,
    ];
}
