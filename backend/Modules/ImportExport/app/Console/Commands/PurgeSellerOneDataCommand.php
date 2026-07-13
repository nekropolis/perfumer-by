<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Jobs\RunSellerOneParseJob;
use Modules\Catalog\Jobs\RunSellerOneRefreshLinkedPricesJob;
use Modules\Catalog\Models\Supplier;
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

        $this->printActiveJobWarnings();
        $this->printOrphanSupplierProductHints($supplierId);

        $hasDbRows = $productsCount > 0 || $offersCount > 0;

        if ($dryRun) {
            if (! $hasDbRows) {
                $this->info('В БД для Seller One нет строк, но будут остановлены активные задачи и очищен кэш парсинга.');
            }
            $this->comment('Запусти без --dry-run, чтобы выполнить очистку.');

            return self::SUCCESS;
        }

        if ($hasDbRows && ! $force && ! $this->confirm('Удалить все данные Seller One? Это необратимо.', false)) {
            $this->warn('Отменено.');

            return self::FAILURE;
        }

        if (! $hasDbRows && ! $force && ! $this->confirm('Очистить кэш/задачи Seller One (строк в БД нет)?', false)) {
            $this->warn('Отменено.');

            return self::FAILURE;
        }

        $result = $importService->purgeAllSellerOneData();

        $this->newLine();
        $this->info('Готово.');
        if (is_string($result['parse_job_stopped'] ?? null) && $result['parse_job_stopped'] !== '') {
            $this->line('Остановлен парсинг: '.$result['parse_job_stopped']);
        }
        if (is_string($result['refresh_job_stopped'] ?? null) && $result['refresh_job_stopped'] !== '') {
            $this->line('Остановлено обновление цен: '.$result['refresh_job_stopped']);
        }
        $this->line('Удалено строк supplier_products: '.(int) $result['supplier_products_deleted']);
        $this->line('Удалено офферов: '.(int) $result['offers_deleted']);
        $this->line('Удалено записей истории цен: '.(int) $result['price_history_deleted']);
        $this->line('Очищено служебных настроек: '.(int) $result['settings_cleared']);
        $this->line('Удалено временных файлов: '.(int) $result['temp_files_removed']);
        $this->comment('Дальше: загрузи прайс и запусти «Новый парсинг» в админке.');

        return self::SUCCESS;
    }

    private function printActiveJobWarnings(): void
    {
        $parseJobId = Cache::get(RunSellerOneParseJob::activeKey());
        if (is_string($parseJobId) && $parseJobId !== '') {
            $this->warn("Активен парсинг Seller One ({$parseJobId}). Без остановки данные могут появиться снова.");
        }

        $refreshJobId = Cache::get(RunSellerOneRefreshLinkedPricesJob::activeKey());
        if (is_string($refreshJobId) && $refreshJobId !== '') {
            $this->warn("Активно обновление цен Seller One ({$refreshJobId}).");
        }
    }

    private function printOrphanSupplierProductHints(int $sellerOneSupplierId): void
    {
        $otherRows = SupplierProduct::query()
            ->where('supplier_id', '!=', $sellerOneSupplierId)
            ->selectRaw('supplier_id, COUNT(*) as row_count')
            ->groupBy('supplier_id')
            ->get();

        if ($otherRows->isEmpty()) {
            return;
        }

        $supplierNames = Supplier::query()
            ->whereIn('id', $otherRows->pluck('supplier_id'))
            ->pluck('code', 'id');

        $this->warn('Есть supplier_products у других поставщиков (purge их не трогает):');
        foreach ($otherRows as $row) {
            $code = (string) ($supplierNames[(int) $row->supplier_id] ?? 'unknown');
            $this->line("  #{$row->supplier_id} ({$code}): {$row->row_count}");
        }
    }
}
