<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;

class ResetSellerOneLinksCommand extends Command
{
    protected $signature = 'seller-one:reset-links
        {--all : Сбросить также подсказки матча у всех строк (не только связанные)}
        {--dry-run : Только показать, что будет сброшено}
        {--force : Без подтверждения}';

    protected $description = 'Сбросить связки Seller One с каталогом перед повторным парсингом';

    public function handle(SupplierPriceImportService $importService): int
    {
        $clearSuggestions = (bool) $this->option('all');
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');

        $supplier = $importService->getOrCreateSellerOneSupplier();
        $supplierId = (int) $supplier->id;

        $linkedCount = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->where('is_linked', true)
            ->count();

        $rowsToReset = $clearSuggestions
            ? SupplierProduct::query()->where('supplier_id', $supplierId)->count()
            : $linkedCount;

        $offersCount = SupplierVariantOffer::query()
            ->where('supplier_id', $supplierId)
            ->count();

        $this->info('Seller One: сброс связок');
        $this->line("Поставщик: {$supplier->name} (#{$supplierId})");
        $this->line('Режим: '.($dryRun ? 'dry-run' : 'write'));
        $this->line('Строк supplier_products: '.$rowsToReset.($clearSuggestions ? ' (все)' : ' (только is_linked)'));
        $this->line("Связанных сейчас: {$linkedCount}");
        $this->line("Офферов supplier_variant_offers: {$offersCount}");

        if ($rowsToReset === 0 && $offersCount === 0) {
            $this->info('Нечего сбрасывать.');

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->comment('Запусти без --dry-run, чтобы выполнить сброс.');

            return self::SUCCESS;
        }

        if (!$force && !$this->confirm('Сбросить связки? После этого нужен новый парсинг прайса.', false)) {
            $this->warn('Отменено.');

            return self::FAILURE;
        }

        $bar = $this->output->createProgressBar($rowsToReset);
        $bar->start();

        $result = $importService->resetAllLinks(
            $clearSuggestions,
            static function (int $processed) use ($bar): void {
                $bar->setProgress($processed);
            },
        );

        $bar->finish();
        $this->newLine(2);

        $this->info('Готово.');
        $this->line('Сброшено строк: '.(int) $result['supplier_products_reset']);
        $this->line('Удалено офферов: '.(int) $result['offers_deleted']);
        $this->line('Подсказки матча: '.($result['clear_suggestions'] ? 'очищены' : 'сохранены'));
        $this->comment('Дальше: загрузи прайс / запусти «Новый парсинг» в админке.');

        return self::SUCCESS;
    }
}
