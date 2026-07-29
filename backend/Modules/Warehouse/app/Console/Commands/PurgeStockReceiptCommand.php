<?php

namespace Modules\Warehouse\Console\Commands;

use Illuminate\Console\Command;
use Modules\Warehouse\Models\StockMovement;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReservation;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Models\StockWriteoffItem;
use Modules\Warehouse\Models\WarehouseStockLot;
use Modules\Warehouse\Services\StockReceiptService;
use Modules\Warehouse\Services\StockReceiptXlsImportService;

class PurgeStockReceiptCommand extends Command
{
    protected $signature = 'warehouse:purge-stock-receipt
        {id : ID прихода}
        {--force : Выполнить удаление (без флага — только отчёт)}
        {--hard : Принудительно: откатить только оставшееся на партиях, игнорируя блокеры}';

    protected $description = 'Безопасно удалить приход с откатом остатков и сбросом строк XLS-импорта';

    public function handle(
        StockReceiptService $receiptService,
        StockReceiptXlsImportService $importService,
    ): int {
        $id = (int) $this->argument('id');
        $force = (bool) $this->option('force');
        $hard = (bool) $this->option('hard');

        $receipt = StockReceipt::query()->with('items')->find($id);
        if (!$receipt) {
            $this->error("Приход #{$id} не найден");

            return self::FAILURE;
        }

        $variantIds = $receipt->items->pluck('variant_id')->map(static fn ($v) => (int) $v)->unique()->values()->all();
        $warehouseId = (int) $receipt->warehouse_id;
        $itemIds = $receipt->items->pluck('id')->map(static fn ($v) => (int) $v)->all();

        $lots = WarehouseStockLot::query()
            ->where('warehouse_id', $warehouseId)
            ->whereIn('stock_receipt_item_id', $itemIds)
            ->get(['id', 'stock_receipt_item_id', 'qty', 'reserved_qty']);

        $blockers = [];

        $reservations = StockReservation::query()
            ->where('warehouse_id', $warehouseId)
            ->whereIn('variant_id', $variantIds)
            ->where('status', 'active')
            ->count();
        if ($reservations > 0) {
            $blockers[] = "Активные резервы (stock_reservations.status=active) по вариантам прихода: {$reservations}";
        }

        // Только проведённые списания (не резервы-журналы, не отменённые).
        $writeoffItems = StockWriteoffItem::query()
            ->whereIn('variant_id', $variantIds)
            ->whereHas('writeoff', function ($q) use ($warehouseId) {
                $q->where('warehouse_id', $warehouseId)
                    ->where('type', 'writeoff')
                    ->where('status', StockWriteoff::STATUS_POSTED);
            })
            ->count();
        if ($writeoffItems > 0) {
            $blockers[] = "Проведённые списания по вариантам склада: {$writeoffItems}";
        }

        $lotsWithReserve = $lots->filter(static fn ($lot) => (int) $lot->reserved_qty > 0)->count();
        if ($lotsWithReserve > 0) {
            $blockers[] = "Партии прихода с резервом: {$lotsWithReserve}";
        }

        $receiptMovements = StockMovement::query()
            ->where('document_type', 'stock_receipt')
            ->where('document_id', $receipt->id)
            ->get(['id', 'variant_id', 'stock_delta', 'type']);

        $this->info("Приход #{$receipt->id} ({$receipt->document_no}) status={$receipt->status}");
        $this->line('Склад: ' . $warehouseId);
        $this->line('Строк: ' . $receipt->items->count());
        $this->line('Открытых партий: ' . $lots->count() . ' (qty=' . $lots->sum('qty') . ', reserved=' . $lots->sum('reserved_qty') . ')');
        $this->line('Движений receipt: ' . $receiptMovements->count());
        $this->line('Сумма stock_delta: ' . $receiptMovements->sum('stock_delta'));

        foreach ($receipt->items as $item) {
            $lot = $lots->firstWhere('stock_receipt_item_id', $item->id);
            $this->line(sprintf(
                '  - item #%d variant=%d qty=%d sku=%s lot=%s',
                $item->id,
                $item->variant_id,
                $item->qty,
                $item->supplier_sku ?? '—',
                $lot
                    ? "#{$lot->id} left={$lot->qty}/res={$lot->reserved_qty}"
                    : 'нет (уже израсходована)'
            ));
        }

        if ($blockers !== [] && ! $hard) {
            $this->warn('Блокеры:');
            foreach ($blockers as $blocker) {
                $this->warn('  • ' . $blocker);
            }
            $this->error('Удаление запрещено. Снимите резервы/списания или запустите с --hard --force.');
            $this->comment('Пример: php artisan warehouse:purge-stock-receipt '.$id.' --hard --force');

            return self::FAILURE;
        }

        if ($hard) {
            $this->warn('Режим --hard: откатим только оставшееся на партиях прихода (уже списанное не трогаем).');
            if ($blockers !== []) {
                $this->warn('Игнорируемые блокеры:');
                foreach ($blockers as $blocker) {
                    $this->warn('  • ' . $blocker);
                }
            }
        }

        if (!$force) {
            $this->comment('Dry-run: добавьте --force для удаления с откатом остатков.');
            if ($blockers !== []) {
                $this->comment('С блокерами: php artisan warehouse:purge-stock-receipt '.$id.' --hard --force');
            }

            return self::SUCCESS;
        }

        if ($hard) {
            $receiptService->destroyHard($receipt);
        } else {
            $receiptService->destroy($receipt);
        }
        $reset = $importService->resetRowsForPurgedReceipt($id);

        $this->info("Приход #{$id} удалён".($hard ? ' (hard)' : '').". Строк импорта сброшено: {$reset}");

        return self::SUCCESS;
    }
}
