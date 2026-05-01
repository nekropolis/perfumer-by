<?php

namespace Modules\ImportExport\Providers;

use Modules\ImportExport\Console\Commands\MapLegacyBrandsBySlugCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyPostsCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyReviewsCommand;
use Modules\ImportExport\Console\Commands\MapLegacyProductsBySlugCommand;
use Nwidart\Modules\Support\ModuleServiceProvider;

class ImportExportServiceProvider extends ModuleServiceProvider
{
    protected string $name = 'ImportExport';

    protected string $nameLower = 'importexport';

    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    protected array $commands = [
        MapLegacyBrandsBySlugCommand::class,
        MapLegacyProductsBySlugCommand::class,
        ImportLegacyReviewsCommand::class,
        ImportLegacyPostsCommand::class,
    ];
}

