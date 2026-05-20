<?php

namespace Modules\Catalog\Providers;

use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Category;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Jobs\SyncProductSearchIndexJob;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeOption;
use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Services\SmartSearch\ProductSearchIndexer;
use Modules\Catalog\Console\Commands\ImportVanilleSampleCommand;
use Modules\Catalog\Console\Commands\ParseVanilleProductsCommand;
use Modules\Catalog\Console\Commands\PruneBrandsWithoutProductsCommand;
use Modules\Catalog\Console\Commands\RegenerateProductImageVariantsCommand;
use Modules\Catalog\Console\Commands\ReindexProductSearchCommand;
use Modules\Catalog\Console\Commands\VanilleImportQueueCommand;
use Nwidart\Modules\Support\ModuleServiceProvider;
use Illuminate\Console\Scheduling\Schedule;

class CatalogServiceProvider extends ModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Catalog';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'catalog';

    /**
     * Command classes to register.
     *
     * @var string[]
     */
    // protected array $commands = [];

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    /**
     * Define module schedules.
     *
     * @param $schedule
     */
    // protected function configureSchedules(Schedule $schedule): void
    // {
    //     $schedule->command('inspire')->hourly();
    // }

    protected array $commands = [
        ImportVanilleSampleCommand::class,
        ParseVanilleProductsCommand::class,
        PruneBrandsWithoutProductsCommand::class,
        RegenerateProductImageVariantsCommand::class,
        ReindexProductSearchCommand::class,
        VanilleImportQueueCommand::class,
    ];

    public function boot(): void
    {
        parent::boot();

        $bump = static function (): void {
            app(CatalogApiCacheService::class)->bumpVersion();
        };

        foreach ([
            Product::class,
            Brand::class,
            Category::class,
            ProductVariantLink::class,
            ProductImage::class,
            VariantDefinition::class,
            ProductAttribute::class,
            ProductAttributeOption::class,
        ] as $modelClass) {
            $modelClass::saved($bump);
            $modelClass::deleted($bump);
        }

        Product::saved(function (Product $product): void {
            if (!(bool) config('services.catalog_search.enabled', false)) {
                return;
            }

            if ((bool) config('services.catalog_search.async_updates', true)) {
                SyncProductSearchIndexJob::dispatch((int) $product->id, false);
                return;
            }

            app(ProductSearchIndexer::class)->syncProduct($product);
        });
        Product::deleted(function (Product $product): void {
            if (!(bool) config('services.catalog_search.enabled', false)) {
                return;
            }

            if ((bool) config('services.catalog_search.async_updates', true)) {
                SyncProductSearchIndexJob::dispatch((int) $product->id, true);
                return;
            }

            app(ProductSearchIndexer::class)->deleteProductById((int) $product->id);
        });
    }

}
