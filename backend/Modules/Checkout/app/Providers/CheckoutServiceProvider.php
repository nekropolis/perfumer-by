<?php

namespace Modules\Checkout\Providers;

use Modules\Checkout\Console\Commands\SyncVeterCitiesCommand;
use Modules\Checkout\Console\Commands\SyncVeterTicketStatusesCommand;
use Nwidart\Modules\Support\ModuleServiceProvider;

class CheckoutServiceProvider extends ModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Checkout';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'checkout';

    /**
     * Command classes to register.
     *
     * @var string[]
     */
    protected array $commands = [
        SyncVeterCitiesCommand::class,
        SyncVeterTicketStatusesCommand::class,
    ];

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];
}
