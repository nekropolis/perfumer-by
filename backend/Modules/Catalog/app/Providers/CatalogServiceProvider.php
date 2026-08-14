<?php

namespace Modules\Catalog\Providers;

use Illuminate\Console\Scheduling\Schedule;
use Modules\Catalog\Console\Commands\FixBrokenSeoProductNamesCommand;
use Modules\Catalog\Console\Commands\FixH1CyrillicLookalikesCommand;
use Modules\Catalog\Console\Commands\ImportVanilleSampleCommand;
use Modules\Catalog\Console\Commands\MergeDuplicateBrandsCommand;
use Modules\Catalog\Console\Commands\ParseVanilleProductsCommand;
use Modules\Catalog\Console\Commands\PruneBrandsWithoutProductsCommand;
use Modules\Catalog\Console\Commands\PruneProductsWithoutVanilleCommand;
use Modules\Catalog\Console\Commands\PullProductSeoReadyCommand;
use Modules\Catalog\Console\Commands\RegenerateProductImageVariantsCommand;
use Modules\Catalog\Console\Commands\ReindexProductSearchCommand;
use Modules\Catalog\Console\Commands\RepairVanilleCatalogImageOrderCommand;
use Modules\Catalog\Console\Commands\RepairVanilleProductNamesCommand;
use Modules\Catalog\Console\Commands\RepairVanilleProductVariantsCommand;
use Modules\Catalog\Console\Commands\StripBrandFromProductNamesCommand;
use Modules\Catalog\Console\Commands\SyncListingMinPricesCommand;
use Modules\Catalog\Console\Commands\VanilleBrandCommand;
use Modules\Catalog\Console\Commands\VanilleBrendyiTotalCommand;
use Modules\Catalog\Console\Commands\VanilleImportQueueCommand;
use Modules\Catalog\Console\Commands\VanilleSyncCommand;
use Modules\Catalog\Console\Commands\WarmCatalogCacheCommand;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Category;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeOption;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;
use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Services\ListingMinPriceService;
use Modules\Catalog\Services\SmartSearch\ProductSearchIndexer;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Nwidart\Modules\Support\ModuleServiceProvider;

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
     * @param  $schedule
     */
    // protected function configureSchedules(Schedule $schedule): void
    // {
    //     $schedule->command('inspire')->hourly();
    // }

    protected array $commands = [
        ImportVanilleSampleCommand::class,
        ParseVanilleProductsCommand::class,
        RepairVanilleProductVariantsCommand::class,
        RepairVanilleProductNamesCommand::class,
        RepairVanilleCatalogImageOrderCommand::class,
        PruneBrandsWithoutProductsCommand::class,
        PruneProductsWithoutVanilleCommand::class,
        MergeDuplicateBrandsCommand::class,
        RegenerateProductImageVariantsCommand::class,
        ReindexProductSearchCommand::class,
        FixBrokenSeoProductNamesCommand::class,
        FixH1CyrillicLookalikesCommand::class,
        StripBrandFromProductNamesCommand::class,
        VanilleImportQueueCommand::class,
        VanilleBrendyiTotalCommand::class,
        VanilleBrandCommand::class,
        VanilleSyncCommand::class,
        SyncListingMinPricesCommand::class,
        WarmCatalogCacheCommand::class,
        PullProductSeoReadyCommand::class,
    ];

    public function register(): void
    {
        $this->app->singleton(CatalogApiCacheService::class);
        parent::register();
    }

    public function boot(): void
    {
        parent::boot();

        $invalidate = static function (): void {
            app(CatalogApiCacheService::class)->requestInvalidation();
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
            ProductAttributeValue::class,
            ProductAttributeValueOption::class,
            SupplierVariantOffer::class,
            WarehouseVariantStock::class,
        ] as $modelClass) {
            $modelClass::saved($invalidate);
            $modelClass::deleted($invalidate);
        }

        Product::saved(function (Product $product): void {
            if (! (bool) config('services.catalog_search.enabled', false)) {
                return;
            }

            app(ProductSearchIndexer::class)->queueProductSync((int) $product->id);
        });
        Product::deleted(function (Product $product): void {
            if (! (bool) config('services.catalog_search.enabled', false)) {
                return;
            }

            app(ProductSearchIndexer::class)->queueProductDelete((int) $product->id);
        });

        $syncListingMinPrice = static function (?int $productId): void {
            if ($productId === null || $productId <= 0) {
                return;
            }

            app(ListingMinPriceService::class)->syncForProduct($productId);
        };

        ProductVariantLink::saved(static function (ProductVariantLink $link) use ($syncListingMinPrice): void {
            $syncListingMinPrice((int) $link->product_id);
        });
        ProductVariantLink::deleted(static function (ProductVariantLink $link) use ($syncListingMinPrice): void {
            $syncListingMinPrice((int) $link->product_id);
        });

        SupplierVariantOffer::saved(static function (SupplierVariantOffer $offer) use ($syncListingMinPrice): void {
            $productId = ProductVariantLink::query()
                ->whereKey($offer->product_variant_id)
                ->value('product_id');
            $syncListingMinPrice($productId !== null ? (int) $productId : null);
        });
        SupplierVariantOffer::deleted(static function (SupplierVariantOffer $offer) use ($syncListingMinPrice): void {
            $productId = ProductVariantLink::query()
                ->whereKey($offer->product_variant_id)
                ->value('product_id');
            $syncListingMinPrice($productId !== null ? (int) $productId : null);
        });

        SupplierProduct::saved(static function (SupplierProduct $supplierProduct) use ($syncListingMinPrice): void {
            $syncListingMinPrice((int) $supplierProduct->product_id);
        });
        SupplierProduct::deleted(static function (SupplierProduct $supplierProduct) use ($syncListingMinPrice): void {
            $syncListingMinPrice((int) $supplierProduct->product_id);
        });

        WarehouseVariantStock::saved(static function (WarehouseVariantStock $stock) use ($syncListingMinPrice): void {
            $syncListingMinPrice((int) $stock->product_id);
        });
        WarehouseVariantStock::deleted(static function (WarehouseVariantStock $stock) use ($syncListingMinPrice): void {
            $syncListingMinPrice((int) $stock->product_id);
        });
    }
}
