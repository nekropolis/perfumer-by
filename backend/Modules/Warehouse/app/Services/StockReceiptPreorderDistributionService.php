<?php

namespace Modules\Warehouse\Services;

use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReservation;
use Modules\Warehouse\Models\WarehouseStockLot;

/**
 * Проведение прихода + разнесение по предзаказам (офер → склад) и резерв.
 */
class StockReceiptPreorderDistributionService
{
    public function __construct(
        private readonly StockReceiptService $receiptService,
        private readonly StockInventoryService $inventoryService,
    ) {
    }

    /**
     * @return array{
     *     receipt: StockReceipt,
     *     distributed_items: int,
     *     updated_orders: int,
     *     status_changed_orders: int
     * }
     */
    public function postAndDistribute(StockReceipt $receipt): array
    {
        return $this->inventoryService->runWithCatalogCacheCommit(function () use ($receipt): array {
            return DB::transaction(function () use ($receipt): array {
                $receipt = StockReceipt::query()->lockForUpdate()->findOrFail($receipt->id);

                if ($receipt->status === StockReceipt::STATUS_DRAFT) {
                    $receipt->setAttribute('skip_retail_price_update', true);
                    $receipt = $this->receiptService->postInTransaction($receipt);
                } elseif ($receipt->status !== StockReceipt::STATUS_POSTED) {
                    abort(422, 'Можно разнести только черновик или проведённый приход');
                }

                $receipt->load(['items', 'supplier']);

                $this->syncOfferPurchasePrices($receipt);

                $result = $this->distributeToPreorders($receipt);

                return [
                    'receipt' => $receipt->fresh(['supplier', 'items']),
                    'distributed_items' => $result['distributed_items'],
                    'updated_orders' => $result['updated_orders'],
                    'status_changed_orders' => $result['status_changed_orders'],
                ];
            });
        });
    }

    private function syncOfferPurchasePrices(StockReceipt $receipt): void
    {
        $supplierId = (int) ($receipt->supplier_id ?? 0);
        if ($supplierId <= 0) {
            return;
        }

        foreach ($receipt->items as $item) {
            $sku = trim((string) ($item->supplier_sku ?? ''));
            $price = $item->supplier_price !== null ? (float) $item->supplier_price : null;
            if ($sku === '' || $price === null || $price < 0) {
                continue;
            }

            SupplierVariantOffer::query()
                ->where('supplier_id', $supplierId)
                ->where(function ($query) use ($sku) {
                    $query->where('external_id', $sku)->orWhere('sku', $sku);
                })
                ->where('product_variant_id', (int) $item->variant_id)
                ->update(['purchase_price' => round($price, 2)]);
        }
    }

    /**
     * @return array{distributed_items: int, updated_orders: int, status_changed_orders: int}
     */
    private function distributeToPreorders(StockReceipt $receipt): array
    {
        $supplierId = (int) ($receipt->supplier_id ?? 0);
        $warehouseId = (int) $receipt->warehouse_id;
        if ($supplierId <= 0 || $warehouseId <= 0) {
            return [
                'distributed_items' => 0,
                'updated_orders' => 0,
                'status_changed_orders' => 0,
            ];
        }

        /** @var array<int, int> $budgetByVariant qty available from this receipt */
        $budgetByVariant = [];
        /** @var array<int, list<int>> $receiptLotIdsByVariant */
        $receiptLotIdsByVariant = [];
        /** @var array<int, list<string>> $skusByVariant */
        $skusByVariant = [];

        foreach ($receipt->items as $item) {
            $variantId = (int) $item->variant_id;
            $qty = (int) $item->qty;
            if ($variantId <= 0 || $qty <= 0) {
                continue;
            }
            $budgetByVariant[$variantId] = ($budgetByVariant[$variantId] ?? 0) + $qty;
            $sku = trim((string) ($item->supplier_sku ?? ''));
            if ($sku !== '') {
                $skusByVariant[$variantId][] = $sku;
            }
        }

        if ($budgetByVariant === []) {
            return [
                'distributed_items' => 0,
                'updated_orders' => 0,
                'status_changed_orders' => 0,
            ];
        }

        $lots = WarehouseStockLot::query()
            ->where('warehouse_id', $warehouseId)
            ->whereIn('stock_receipt_item_id', $receipt->items->pluck('id')->all())
            ->orderBy('id')
            ->get();

        foreach ($lots as $lot) {
            $variantId = (int) $lot->variant_id;
            $receiptLotIdsByVariant[$variantId][] = (int) $lot->id;
        }

        $variantIds = array_keys($budgetByVariant);
        $skuList = [];
        foreach ($skusByVariant as $list) {
            foreach ($list as $sku) {
                $skuList[$sku] = true;
            }
        }
        $skus = array_keys($skuList);

        $orders = Order::query()
            // «Заказан» (order) — товары уже заказаны у поставщика и ждут прихода.
            ->where('status', 'order')
            ->with(['items.supplierVariantOffer'])
            ->whereHas('items', function ($query) use ($supplierId, $variantIds, $skus) {
                $query->whereNotNull('supplier_variant_offer_id')
                    ->whereIn('variant_id', $variantIds)
                    ->whereHas('supplierVariantOffer', function ($offerQuery) use ($supplierId, $skus) {
                        $offerQuery->where('supplier_id', $supplierId);
                        if ($skus !== []) {
                            $offerQuery->where(function ($codeQuery) use ($skus) {
                                $codeQuery->whereIn('external_id', $skus)
                                    ->orWhereIn('sku', $skus);
                            });
                        }
                    });
            })
            ->orderByRaw('shipment_date IS NULL')
            ->orderBy('shipment_date')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $distributedItems = 0;
        $updatedOrderIds = [];
        $statusChanged = 0;

        foreach ($orders as $order) {
            $touched = false;

            foreach ($order->items as $item) {
                $offer = $item->supplierVariantOffer;
                if (!$offer || (int) $offer->supplier_id !== $supplierId) {
                    continue;
                }

                $variantId = (int) ($item->variant_id ?? 0);
                $qty = (int) $item->qty;
                if ($variantId <= 0 || $qty <= 0) {
                    continue;
                }

                $offerCode = trim((string) ($offer->external_id ?: $offer->sku ?: ''));
                $variantSkus = $skusByVariant[$variantId] ?? [];
                if ($offerCode === '' || $variantSkus === [] || !in_array($offerCode, $variantSkus, true)) {
                    continue;
                }

                $available = $budgetByVariant[$variantId] ?? 0;
                if ($available < $qty) {
                    continue;
                }

                $lotIds = $receiptLotIdsByVariant[$variantId] ?? [];
                $allocations = $this->allocateFromReceiptLots($lotIds, $qty);
                if ($allocations === null) {
                    continue;
                }

                $item->update([
                    'availability_source' => 'main',
                    'waiting_discount' => false,
                    'supplier_variant_offer_id' => null,
                    'supplier_purchase_price' => null,
                    'stock_lot_allocations' => $allocations,
                ]);

                $budgetByVariant[$variantId] = $available - $qty;
                $distributedItems++;
                $touched = true;
            }

            if (!$touched) {
                continue;
            }

            $updatedOrderIds[$order->id] = true;

            $order->unsetRelation('items');
            $order->load('items');

            $this->inventoryService->releaseForOrderInTransaction($order, 'receipt_preorder_distribute');
            $order->unsetRelation('items');
            $order->load('items');
            $this->inventoryService->reserveForOrderInTransaction($order);

            if ($this->orderFullyReservedOnWarehouse($order)) {
                $order->update([
                    'status' => 'na_sklade',
                    'updated_at' => now(),
                ]);
                $statusChanged++;
            }
        }

        return [
            'distributed_items' => $distributedItems,
            'updated_orders' => count($updatedOrderIds),
            'status_changed_orders' => $statusChanged,
        ];
    }

    /**
     * @param  list<int>  $lotIds
     * @return list<array{lot_id: int, qty: int}>|null
     */
    private function allocateFromReceiptLots(array $lotIds, int $needQty): ?array
    {
        if ($lotIds === [] || $needQty <= 0) {
            return null;
        }

        $lots = WarehouseStockLot::query()
            ->whereIn('id', $lotIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $remaining = $needQty;
        $allocations = [];

        foreach ($lots as $lot) {
            $free = max(0, (int) $lot->qty - (int) $lot->reserved_qty);
            if ($free <= 0) {
                continue;
            }
            $take = min($free, $remaining);
            if ($take <= 0) {
                continue;
            }
            $allocations[] = [
                'lot_id' => (int) $lot->id,
                'qty' => $take,
            ];
            $remaining -= $take;
            if ($remaining <= 0) {
                break;
            }
        }

        if ($remaining > 0) {
            return null;
        }

        return $allocations;
    }

    private function orderFullyReservedOnWarehouse(Order $order): bool
    {
        $order->load('items');
        if ($order->items->isEmpty()) {
            return false;
        }

        $reservations = StockReservation::query()
            ->where('order_id', $order->id)
            ->where('status', 'active')
            ->get()
            ->groupBy('order_item_id');

        foreach ($order->items as $item) {
            /** @var OrderItem $item */
            $need = (int) $item->qty;
            if ($need <= 0) {
                continue;
            }

            $itemReservations = $reservations->get($item->id);
            $reservedQty = $itemReservations
                ? (int) $itemReservations->sum('qty')
                : 0;

            if ($reservedQty < $need) {
                return false;
            }

            $source = (string) ($item->availability_source ?? '');
            if (!in_array($source, ['main', 'main+supplier'], true)) {
                return false;
            }
            if ((bool) $item->waiting_discount) {
                return false;
            }
            if ($item->supplier_variant_offer_id) {
                return false;
            }
        }

        return true;
    }
}
