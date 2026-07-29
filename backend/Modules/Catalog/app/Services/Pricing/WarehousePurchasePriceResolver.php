<?php

namespace Modules\Catalog\Services\Pricing;

use Illuminate\Support\Facades\DB;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Services\StockLotService;

final class WarehousePurchasePriceResolver
{
    private function lotService(): StockLotService
    {
        return app(StockLotService::class);
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, string>
     */
    public function avgPurchaseByVariant(array $variantIds, int $warehouseId): array
    {
        return $this->lotService()->avgPurchaseByVariant($variantIds, $warehouseId);
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, string>
     */
    public function minPurchaseByVariant(array $variantIds, int $warehouseId): array
    {
        return $this->lotService()->minPurchaseByVariant($variantIds, $warehouseId);
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, array{
     *     warehouse_purchase: string,
     *     supplier_sku: ?string,
     *     receipt_supplier_id: ?int,
     *     receipt_supplier_code: ?string,
     *     stock_receipt_id: int,
     *     received_at: ?string
     * }>
     */
    public function lastPostedReceiptMetaForMainWarehouse(array $variantIds, int $mainWarehouseId): array
    {
        return $this->lastPostedReceiptMetaForWarehouse($variantIds, $mainWarehouseId);
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, array{
     *     warehouse_purchase: string,
     *     supplier_sku: ?string,
     *     receipt_supplier_id: ?int,
     *     receipt_supplier_code: ?string,
     *     stock_receipt_id: int,
     *     received_at: ?string
     * }>
     */
    public function lastPostedReceiptMetaForWarehouse(array $variantIds, int $warehouseId): array
    {
        $variantIds = array_values(array_unique(array_filter(
            array_map(static fn (mixed $id): int => (int) $id, $variantIds),
            static fn (int $id): bool => $id > 0,
        )));

        if ($variantIds === [] || $warehouseId <= 0) {
            return [];
        }

        $rows = DB::table('stock_receipt_items as sri')
            ->join('stock_receipts as sr', 'sr.id', '=', 'sri.stock_receipt_id')
            ->where('sr.status', StockReceipt::STATUS_POSTED)
            ->where('sr.warehouse_id', $warehouseId)
            ->whereIn('sri.variant_id', $variantIds)
            ->whereNotNull('sri.variant_id')
            ->where('sri.supplier_price', '>', 0)
            ->orderByDesc('sr.received_at')
            ->orderByDesc('sr.id')
            ->orderByDesc('sri.id')
            ->get([
                'sri.variant_id',
                'sri.supplier_price',
                'sri.supplier_sku',
                'sri.stock_receipt_id',
                'sr.supplier_id',
                'sr.supplier_code',
                'sr.received_at',
            ]);

        $map = [];
        foreach ($rows as $row) {
            $variantId = (int) $row->variant_id;
            if (isset($map[$variantId])) {
                continue;
            }

            $supplierSku = trim((string) ($row->supplier_sku ?? ''));
            $supplierCode = trim((string) ($row->supplier_code ?? ''));

            $map[$variantId] = [
                'warehouse_purchase' => number_format((float) $row->supplier_price, 2, '.', ''),
                'supplier_sku' => $supplierSku !== '' ? $supplierSku : null,
                'receipt_supplier_id' => $row->supplier_id !== null ? (int) $row->supplier_id : null,
                'receipt_supplier_code' => $supplierCode !== '' ? $supplierCode : null,
                'stock_receipt_id' => (int) $row->stock_receipt_id,
                'received_at' => $row->received_at !== null ? (string) $row->received_at : null,
            ];
        }

        $avgMap = $this->lotService()->avgPurchaseByVariant($variantIds, $warehouseId);
        foreach ($map as $variantId => $meta) {
            if (isset($avgMap[$variantId])) {
                $map[$variantId]['warehouse_purchase'] = $avgMap[$variantId];
            }
        }

        return $map;
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, float>
     */
    public function lastPostedPricesForMainWarehouse(array $variantIds, int $mainWarehouseId): array
    {
        $map = [];
        foreach ($this->lastPostedReceiptMetaForWarehouse($variantIds, $mainWarehouseId) as $variantId => $meta) {
            $map[$variantId] = (float) $meta['warehouse_purchase'];
        }

        return $map;
    }

    /**
     * Последняя posted-цена прихода по парам склад+вариант.
     *
     * @param  \Illuminate\Support\Collection<int, object{warehouse_id?: mixed, variant_id?: mixed}>  $rows
     * @return array<string, string> ключ "{warehouseId}:{variantId}" => "12.34"
     */
    public function lastPostedPurchasePriceMapForRows($rows): array
    {
        /** @var array<int, list<int>> $variantIdsByWarehouse */
        $variantIdsByWarehouse = [];
        foreach ($rows as $row) {
            $warehouseId = (int) ($row->warehouse_id ?? 0);
            $variantId = (int) ($row->variant_id ?? 0);
            if ($warehouseId <= 0 || $variantId <= 0) {
                continue;
            }
            $variantIdsByWarehouse[$warehouseId][] = $variantId;
        }

        $map = [];
        foreach ($variantIdsByWarehouse as $warehouseId => $variantIds) {
            foreach ($this->lastPostedReceiptMetaForWarehouse($variantIds, $warehouseId) as $variantId => $meta) {
                $map[$warehouseId.':'.$variantId] = $meta['warehouse_purchase'];
            }
        }

        return $map;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object{warehouse_id?: mixed, variant_id?: mixed}>  $rows
     * @return array<string, string>
     */
    public function minPurchasePriceMapForRows($rows): array
    {
        return $this->lotService()->minPurchasePriceMapForRows($rows);
    }

    public function resolveMainWarehouseId(): int
    {
        return (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
    }
}
