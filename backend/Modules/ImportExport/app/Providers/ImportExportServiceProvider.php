<?php

namespace Modules\ImportExport\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class ImportExportServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'ImportExport';

    protected string $nameLower = 'importexport';

    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];
}

