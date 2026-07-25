<?php

namespace Modules\ImportExport\Providers;

use Modules\ImportExport\Console\Commands\MapLegacyBrandsBySlugCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyProductImagesCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyPostsCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyCustomersCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyDiscountCardsCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyOrdersCommand;
use Modules\ImportExport\Console\Commands\FixLegacyOrdersDeliveryDateCommand;
use Modules\ImportExport\Console\Commands\ImportLegacyReviewsCommand;
use Modules\ImportExport\Console\Commands\MapLegacyProductsBySlugCommand;
use Modules\ImportExport\Console\Commands\NormalizeUserPhonesCommand;
use Modules\ImportExport\Console\Commands\PurgeSellerOneDataCommand;
use Modules\ImportExport\Console\Commands\ResetSellerOneLinksCommand;
use Modules\ImportExport\Console\Commands\NormalizeOrderPhonesCommand;
use Modules\ImportExport\Console\Commands\NormalizeBelarusPhonesCommand;
use Modules\ImportExport\Console\Commands\PurgeLegacyIncompleteOrdersCommand;
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
        ImportLegacyProductImagesCommand::class,
        ImportLegacyCustomersCommand::class,
        ImportLegacyDiscountCardsCommand::class,
        ImportLegacyOrdersCommand::class,
        FixLegacyOrdersDeliveryDateCommand::class,
        NormalizeUserPhonesCommand::class,
        NormalizeOrderPhonesCommand::class,
        NormalizeBelarusPhonesCommand::class,
        PurgeLegacyIncompleteOrdersCommand::class,
        ImportLegacyReviewsCommand::class,
        ImportLegacyPostsCommand::class,
        ResetSellerOneLinksCommand::class,
        PurgeSellerOneDataCommand::class,
    ];
}

