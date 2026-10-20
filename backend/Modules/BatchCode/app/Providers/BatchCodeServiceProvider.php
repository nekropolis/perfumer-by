<?php

namespace Modules\BatchCode\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class BatchCodeServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'BatchCode';

    protected string $nameLower = 'batchcode';

    protected array $providers = [
        RouteServiceProvider::class,
    ];
}
