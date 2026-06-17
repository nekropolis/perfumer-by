<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Models\SupplierPriceHistory;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;

class PurgeSellerOneDataCommand extends Command
{
    protected $signature = 'seller-one:purge
        {--dry-run : Только показать, что будет удалено}
        {--force : Без подтверждения}';

    protected $description = 'Удалить все импортированные данные Seller One (строки прайса, офферы, история цен)';

    public function handle(SupplierPriceImportService $importService): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');

        $supplier = $importService->getOrCreateSellerOneSupplier();
        $supplierId = (int) $supplier->id;

        $productsCount = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->count();

        $offersCount = SupplierVariantOffer::query()
            ->where('supplier_id', $supplierId)
            ->count();

        $offerIds = SupplierVariantOffer::query()
            ->where('supplier_id', $supplierId)
            ->pluck('id');

        $historyCount = $offerIds->isEmpty()
            ? 0
            : SupplierPriceHistory::query()
                ->whereIn('supplier_variant_offer_id', $offerIds)
                ->count();

        $this->info('Seller One: полная очистка данных');
        $this->line("Поставщик: {$supplier->name} (#{$supplierId})");
        $this->line('Режим: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Строк supplier_products: {$productsCount}");
        $this->line("Офферов supplier_variant_offers: {$offersCount}");
        $this->line("Записей supplier_price_histories: {$historyCount}");
        $this->line('Сохраняются: правила матча, настройки наценки, каталог.');

        if ($productsCount === 0 && $offersCount === 0) {
            $this->info('Нечего удалять.');

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->comment('Запусти без --dry-run, чтобы выполнить очистку.');

            return self::SUCCESS;
        }

        if (! $force && ! $this->confirm('Удалить все данные Seller One? Это необратимо.', false)) {
            $this->warn('Отменено.');

            return self::FAILURE;
        }

        $result = $importService->purgeAllSellerOneData();

        $this->newLine();
        $this->info('Готово.');
        $this->line('Удалено строк supplier_products: '.(int) $result['supplier_products_deleted']);
        $this->line('Удалено офферов: '.(int) $result['offers_deleted']);
        $this->line('Удалено записей истории цен: '.(int) $result['price_history_deleted']);
        $this->line('Очищено служебных настроек: '.(int) $result['settings_cleared']);
        $this->line('Удалено временных файлов: '.(int) $result['temp_files_removed']);
        $this->comment('Дальше: загрузи прайс и запусти «Новый парсинг» в админке.');

        return self::SUCCESS;
    }
}
