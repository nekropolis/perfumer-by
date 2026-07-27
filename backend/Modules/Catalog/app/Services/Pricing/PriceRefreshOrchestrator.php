<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\PriceRefreshRun;
use Modules\Catalog\Models\Supplier;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;

final class PriceRefreshOrchestrator
{
    public function __construct(
        private readonly WarehousePriceRefreshService $warehousePriceRefresh,
        private readonly AllparfumeRetailPriceApplyService $allparfumePriceApply,
        private readonly SupplierPriceFileStorage $priceFileStorage,
        private readonly SupplierPriceImportService $supplierPriceImport,
    ) {
    }

    /**
     * @param  callable(array<string, mixed>): void|null  $onProgress
     */
    public function run(PriceRefreshRun $run, ?callable $onProgress = null): array
    {
        $run->update([
            'status' => PriceRefreshRun::STATUS_RUNNING,
            'started_at' => now(),
        ]);

        $stats = [
            'warehouse' => [
                'processed' => 0,
                'updated' => 0,
                'unchanged' => 0,
                'skipped_by_rule' => 0,
                'no_purchase_price' => 0,
                'blended_updated' => 0,
                'manual_queued' => 0,
                'manual_resolved' => 0,
            ],
            'allparfume' => [
                'processed' => 0,
                'updated' => 0,
                'unchanged' => 0,
                'manual_queued' => 0,
                'skipped' => 0,
            ],
            'suppliers' => [],
        ];

        try {
            $stats['warehouse'] = $this->warehousePriceRefresh->refresh(
                (int) $run->id,
                function (array $progress) use ($onProgress): void {
                    if ($onProgress !== null) {
                        $onProgress($progress);
                    }
                },
            );

            $stats['allparfume'] = $this->allparfumePriceApply->apply(
                (int) $run->id,
                function (array $progress) use ($onProgress): void {
                    if ($onProgress !== null) {
                        $onProgress($progress);
                    }
                },
            );

            $suppliers = $this->priceFileStorage->listStoredPricingSuppliers();

            foreach ($suppliers as $supplierRow) {
                $supplier = Supplier::query()->find((int) $supplierRow['supplier_id']);
                if ($supplier === null) {
                    continue;
                }

                $absolutePath = $this->priceFileStorage->getAbsolutePath((int) $supplier->id);
                if ($absolutePath === null) {
                    continue;
                }

                $supplierStats = $this->supplierPriceImport->refreshLinkedPricesFromAbsolutePath(
                    $absolutePath,
                    function (array $progress) use ($onProgress, $supplier): void {
                        if ($onProgress === null) {
                            return;
                        }

                        $processed = (int) ($progress['processed'] ?? 0);
                        $total = (int) ($progress['total_linked'] ?? 0);
                        $percent = $total > 0
                            ? (int) min(100, max(0, round(($processed / $total) * 100)))
                            : ($processed > 0 ? 100 : 0);

                        $onProgress(array_merge($progress, [
                            'phase' => 'supplier',
                            'supplier_id' => (int) $supplier->id,
                            'supplier_code' => (string) $supplier->code,
                            'supplier_name' => (string) $supplier->name,
                            'processed' => $processed,
                            'total' => $total,
                            'total_linked' => $total,
                            'progress' => $percent,
                            'message' => (string) ($progress['message'] ?? (
                                $total > 0
                                    ? "Поставщик {$supplier->name}: {$processed} / {$total}"
                                    : "Поставщик {$supplier->name}: нет связанных строк"
                            )),
                            'status' => 'running',
                        ]));
                    },
                );

                $this->supplierPriceImport->recordLastPriceApply(
                    $this->priceFileStorage->getMeta((int) $supplier->id)['original_name'],
                );

                $stats['suppliers'][$supplier->code] = $this->normalizeSupplierStats($supplierStats);
            }

            $run->update([
                'status' => PriceRefreshRun::STATUS_COMPLETED,
                'finished_at' => now(),
                'stats' => $stats,
            ]);

            return $stats;
        } catch (\Throwable $e) {
            $run->update([
                'status' => PriceRefreshRun::STATUS_FAILED,
                'finished_at' => now(),
                'error_message' => $e->getMessage(),
                'stats' => $stats,
            ]);

            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<string, int|bool>
     */
    private function normalizeSupplierStats(array $result): array
    {
        $updated = (int) ($result['updated'] ?? 0);
        $priceChanged = (int) ($result['price_changed'] ?? 0);

        return [
            'skipped' => false,
            'processed' => $updated,
            'updated' => $priceChanged,
            'unchanged' => max(0, $updated - $priceChanged),
            'skipped_rows' => (int) ($result['skipped'] ?? 0),
            'missing_from_price_file' => (int) ($result['missing_codes'] ?? 0),
            'deactivated_offers' => (int) ($result['deactivated_offers'] ?? 0),
            'became_in_stock' => (int) ($result['became_in_stock'] ?? 0),
        ];
    }
}
