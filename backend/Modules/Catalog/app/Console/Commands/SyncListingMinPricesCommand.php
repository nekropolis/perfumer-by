<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Services\ListingMinPriceService;

class SyncListingMinPricesCommand extends Command
{
    protected $signature = 'catalog:sync-listing-min-prices {--chunk=200 : Размер пачки}';

    protected $description = 'Пересчитать денормализованные поля products.listing_min_price и listing_max_price';

    public function handle(ListingMinPriceService $service): int
    {
        $chunk = max(1, (int) $this->option('chunk'));
        $this->info("Синхронизация listing_min_price / listing_max_price (chunk={$chunk})...");

        $updated = $service->syncAll($chunk);

        $this->info("Готово. Обновлено товаров: {$updated}.");

        return self::SUCCESS;
    }
}
