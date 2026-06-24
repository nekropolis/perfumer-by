<?php

namespace Modules\Catalog\Services\Pricing;

use Illuminate\Support\Facades\DB;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\Warehouse;

final class WarehousePurchasePriceResolver
{
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
        $variantIds = array_values(array_unique(array_filter(
            array_map(static fn (mixed $id): int => (int) $id, $variantIds),
            static fn (int $id): bool => $id > 0,
        )));

        if ($variantIds === [] || $mainWarehouseId <= 0) {
            return [];
        }

        $rows = DB::table('stock_receipt_items as sri')
            ->join('stock_receipts as sr', 'sr.id', '=', 'sri.stock_receipt_id')
            ->where('sr.status', StockReceipt::STATUS_POSTED)
            ->where('sr.warehouse_id', $mainWarehouseId)
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

        return $map;
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, float>
     */
    public function lastPostedPricesForMainWarehouse(array $variantIds, int $mainWarehouseId): array
    {
        $map = [];
        foreach ($this->lastPostedReceiptMetaForMainWarehouse($variantIds, $mainWarehouseId) as $variantId => $meta) {
            $map[$variantId] = (float) $meta['warehouse_purchase'];
        }

        return $map;
    }

    public function resolveMainWarehouseId(): int
    {
        return (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
    }
}
