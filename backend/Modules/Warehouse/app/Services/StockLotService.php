<?php

namespace Modules\Warehouse\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptItem;
use Modules\Warehouse\Models\WarehouseStockLot;

/**
 * Партии склада: остаток по цене прихода без слияния разных цен.
 */
final class StockLotService
{
    /**
     * Создать лот из проведённой строки прихода.
     */
    public function createFromReceiptItem(StockReceipt $receipt, StockReceiptItem $item): WarehouseStockLot
    {
        $payload = is_array($item->payload) ? $item->payload : [];
        $comment = trim((string) ($payload['comment'] ?? ''));

        return WarehouseStockLot::query()->create([
            'warehouse_id' => (int) $receipt->warehouse_id,
            'product_id' => (int) $item->product_id,
            'variant_id' => (int) $item->variant_id,
            'stock_receipt_item_id' => (int) $item->id,
            'supplier_price' => $item->supplier_price,
            'qty' => max(0, (int) $item->qty),
            'reserved_qty' => 0,
            'supplier_sku' => $item->supplier_sku,
            'supplier_name' => $receipt->supplier_name,
            'comment' => $comment !== '' ? $comment : null,
        ]);
    }

    /**
     * Открытые лоты (qty > 0), дешёвые первые.
     *
     * @return Collection<int, WarehouseStockLot>
     */
    public function openLotsForVariant(int $warehouseId, int $variantId, bool $lock = false): Collection
    {
        $query = WarehouseStockLot::query()
            ->where('warehouse_id', $warehouseId)
            ->where('variant_id', $variantId)
            ->where('qty', '>', 0)
            ->orderByRaw('supplier_price IS NULL')
            ->orderBy('supplier_price')
            // При равной цене сначала лоты без комментария, затем любые.
            ->orderByRaw("CASE WHEN comment IS NULL OR TRIM(comment) = '' THEN 0 ELSE 1 END")
            ->orderBy('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->get();
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, string> variant_id => min price
     */
    public function minPurchaseByVariant(array $variantIds, int $warehouseId): array
    {
        $variantIds = $this->normalizeIds($variantIds);
        if ($variantIds === [] || $warehouseId <= 0) {
            return [];
        }

        $rows = WarehouseStockLot::query()
            ->where('warehouse_id', $warehouseId)
            ->whereIn('variant_id', $variantIds)
            ->where('qty', '>', 0)
            ->whereNotNull('supplier_price')
            ->where('supplier_price', '>', 0)
            ->groupBy('variant_id')
            ->selectRaw('variant_id, MIN(supplier_price) as min_price')
            ->get();

        $map = [];
        foreach ($rows as $row) {
            $map[(int) $row->variant_id] = MoneyDecimal::normalize($row->min_price);
        }

        return $map;
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, string> variant_id => avg price (простое среднее цен лотов)
     */
    public function avgPurchaseByVariant(array $variantIds, int $warehouseId): array
    {
        $variantIds = $this->normalizeIds($variantIds);
        if ($variantIds === [] || $warehouseId <= 0) {
            return [];
        }

        $rows = WarehouseStockLot::query()
            ->where('warehouse_id', $warehouseId)
            ->whereIn('variant_id', $variantIds)
            ->where('qty', '>', 0)
            ->whereNotNull('supplier_price')
            ->where('supplier_price', '>', 0)
            ->get(['variant_id', 'supplier_price']);

        /** @var array<int, list<float>> $prices */
        $prices = [];
        foreach ($rows as $row) {
            $prices[(int) $row->variant_id][] = (float) $row->supplier_price;
        }

        $map = [];
        foreach ($prices as $variantId => $list) {
            if ($list === []) {
                continue;
            }
            $avg = array_sum($list) / count($list);
            $map[$variantId] = MoneyDecimal::normalize($avg);
        }

        return $map;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object{warehouse_id?: mixed, variant_id?: mixed}>  $rows
     * @return array<string, string> "{warehouseId}:{variantId}" => min price
     */
    public function minPurchasePriceMapForRows($rows): array
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
            foreach ($this->minPurchaseByVariant($variantIds, $warehouseId) as $variantId => $price) {
                $map[$warehouseId.':'.$variantId] = $price;
            }
        }

        return $map;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object{warehouse_id?: mixed, variant_id?: mixed, stock?: mixed}>  $rows
     * @return array<string, string> "{warehouseId}:{variantId}" => line total
     */
    public function lineTotalMapForRows($rows): array
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
            $variantIds = $this->normalizeIds($variantIds);
            if ($variantIds === []) {
                continue;
            }

            $lots = WarehouseStockLot::query()
                ->where('warehouse_id', $warehouseId)
                ->whereIn('variant_id', $variantIds)
                ->where('qty', '>', 0)
                ->get(['variant_id', 'supplier_price', 'qty']);

            /** @var array<int, int> $cents */
            $cents = [];
            foreach ($lots as $lot) {
                $variantId = (int) $lot->variant_id;
                if ($lot->supplier_price === null) {
                    continue;
                }
                $priceCents = (int) round((float) $lot->supplier_price * 100);
                $cents[$variantId] = ($cents[$variantId] ?? 0) + ($priceCents * (int) $lot->qty);
            }

            foreach ($cents as $variantId => $totalCents) {
                $map[$warehouseId.':'.$variantId] = number_format($totalCents / 100, 2, '.', '');
            }
        }

        return $map;
    }

    /**
     * Аллокация qty с самых дешёвых лотов (или с явно выбранных).
     *
     * @param  list<array{lot_id: int, qty: int}>|null  $explicit
     * @return list<array{lot_id: int, qty: int, price: string|null, reserved_qty?: int}>
     */
    public function allocateLots(
        int $warehouseId,
        int $variantId,
        int $qty,
        ?array $explicit = null,
        bool $forReserve = false,
    ): array {
        if ($qty <= 0) {
            return [];
        }

        if ($explicit !== null && $explicit !== []) {
            return $this->allocateExplicit($warehouseId, $variantId, $qty, $explicit, $forReserve);
        }

        $lots = $this->openLotsForVariant($warehouseId, $variantId, true);
        $left = $qty;
        $allocations = [];

        foreach ($lots as $lot) {
            if ($left <= 0) {
                break;
            }
            $available = $forReserve
                ? max(0, (int) $lot->qty - (int) $lot->reserved_qty)
                : max(0, (int) $lot->qty);
            if ($available <= 0) {
                continue;
            }
            $take = min($left, $available);
            $allocations[] = [
                'lot_id' => (int) $lot->id,
                'qty' => $take,
                'price' => $lot->supplier_price !== null
                    ? MoneyDecimal::normalize($lot->supplier_price)
                    : null,
            ];
            $left -= $take;
        }

        if ($left > 0) {
            throw ValidationException::withMessages([
                'items' => "Недостаточно партий на складе #{$warehouseId} для варианта #{$variantId} (не хватает {$left} шт.)",
            ]);
        }

        return $allocations;
    }

    /**
     * @param  list<array{lot_id: int, qty: int}>  $explicit
     * @return list<array{lot_id: int, qty: int, price: string|null}>
     */
    private function allocateExplicit(
        int $warehouseId,
        int $variantId,
        int $qty,
        array $explicit,
        bool $forReserve,
    ): array {
        $sum = 0;
        $allocations = [];

        foreach ($explicit as $row) {
            $lotId = (int) ($row['lot_id'] ?? 0);
            $take = (int) ($row['qty'] ?? 0);
            if ($lotId <= 0 || $take <= 0) {
                continue;
            }

            /** @var WarehouseStockLot|null $lot */
            $lot = WarehouseStockLot::query()->lockForUpdate()->find($lotId);
            if (
                ! $lot
                || (int) $lot->warehouse_id !== $warehouseId
                || (int) $lot->variant_id !== $variantId
            ) {
                throw ValidationException::withMessages([
                    'items' => "Партия #{$lotId} не найдена для варианта #{$variantId}",
                ]);
            }

            $available = $forReserve
                ? max(0, (int) $lot->qty - (int) $lot->reserved_qty)
                : max(0, (int) $lot->qty);
            if ($available < $take) {
                throw ValidationException::withMessages([
                    'items' => "В партии #{$lotId} доступно только {$available} шт.",
                ]);
            }

            $allocations[] = [
                'lot_id' => $lotId,
                'qty' => $take,
                'price' => $lot->supplier_price !== null
                    ? MoneyDecimal::normalize($lot->supplier_price)
                    : null,
            ];
            $sum += $take;
        }

        if ($sum !== $qty) {
            throw ValidationException::withMessages([
                'items' => "Сумма по партиям ({$sum}) должна равняться количеству ({$qty})",
            ]);
        }

        return $allocations;
    }

    /**
     * @param  list<array{lot_id: int, qty: int}>  $allocations
     */
    public function applyReserveAllocations(array $allocations): void
    {
        foreach ($allocations as $row) {
            $lot = WarehouseStockLot::query()->lockForUpdate()->findOrFail((int) $row['lot_id']);
            $take = (int) $row['qty'];
            $available = max(0, (int) $lot->qty - (int) $lot->reserved_qty);
            if ($available < $take) {
                throw ValidationException::withMessages([
                    'items' => "Недостаточно свободного остатка в партии #{$lot->id}",
                ]);
            }
            $lot->update([
                'reserved_qty' => (int) $lot->reserved_qty + $take,
            ]);
        }
    }

    /**
     * @param  list<array{lot_id: int, qty: int}>  $allocations
     */
    public function applyReleaseAllocations(array $allocations): void
    {
        foreach ($allocations as $row) {
            $lot = WarehouseStockLot::query()->lockForUpdate()->find((int) $row['lot_id']);
            if (! $lot) {
                continue;
            }
            $take = (int) $row['qty'];
            $lot->update([
                'reserved_qty' => max(0, (int) $lot->reserved_qty - $take),
            ]);
        }
    }

    /**
     * Списание: уменьшает qty (и reserved_qty если fromReserve).
     *
     * @param  list<array{lot_id: int, qty: int}>  $allocations
     */
    public function applyWriteoffAllocations(array $allocations, bool $fromReserve = false): void
    {
        foreach ($allocations as $row) {
            $lot = WarehouseStockLot::query()->lockForUpdate()->findOrFail((int) $row['lot_id']);
            $take = (int) $row['qty'];

            if ((int) $lot->qty < $take) {
                throw ValidationException::withMessages([
                    'items' => "Недостаточно остатка в партии #{$lot->id}",
                ]);
            }

            $newQty = (int) $lot->qty - $take;
            $newReserved = (int) $lot->reserved_qty;
            if ($fromReserve) {
                if ($newReserved < $take) {
                    throw ValidationException::withMessages([
                        'items' => "Недостаточно резерва в партии #{$lot->id}",
                    ]);
                }
                $newReserved -= $take;
            } else {
                $newReserved = min($newReserved, $newQty);
            }

            if ($newQty <= 0) {
                $lot->delete();
            } else {
                $lot->update([
                    'qty' => $newQty,
                    'reserved_qty' => $newReserved,
                ]);
            }
        }
    }

    /**
     * Откат списания: вернуть qty на лоты (создать заново, если удалены — только если есть receipt_item).
     *
     * @param  list<array{lot_id: int, qty: int, price?: string|null}>  $allocations
     */
    public function restoreWriteoffAllocations(
        array $allocations,
        int $warehouseId,
        int $productId,
        int $variantId,
        bool $restoreReserve = false,
    ): void {
        foreach ($allocations as $row) {
            $take = (int) ($row['qty'] ?? 0);
            if ($take <= 0) {
                continue;
            }

            $lotId = (int) ($row['lot_id'] ?? 0);
            $lot = $lotId > 0
                ? WarehouseStockLot::query()->lockForUpdate()->find($lotId)
                : null;

            if ($lot) {
                $lot->update([
                    'qty' => (int) $lot->qty + $take,
                    'reserved_qty' => $restoreReserve
                        ? (int) $lot->reserved_qty + $take
                        : (int) $lot->reserved_qty,
                ]);
                continue;
            }

            // Лот был удалён при полном списании — восстанавливаем каркас.
            WarehouseStockLot::query()->create([
                'warehouse_id' => $warehouseId,
                'product_id' => $productId,
                'variant_id' => $variantId,
                'stock_receipt_item_id' => null,
                'supplier_price' => $row['price'] ?? null,
                'qty' => $take,
                'reserved_qty' => $restoreReserve ? $take : 0,
                'supplier_sku' => null,
                'supplier_name' => null,
                'comment' => null,
            ]);
        }
    }

    /**
     * Откат прихода: уменьшить/удалить лот по receipt_item_id.
     */
    public function rollbackReceiptItem(StockReceiptItem $item, int $warehouseId): void
    {
        $lot = WarehouseStockLot::query()
            ->where('stock_receipt_item_id', $item->id)
            ->where('warehouse_id', $warehouseId)
            ->lockForUpdate()
            ->first();

        if (! $lot) {
            // Legacy / уже списано — ничего не делаем на уровне лота.
            return;
        }

        $qty = (int) $item->qty;
        if ((int) $lot->reserved_qty > 0) {
            throw ValidationException::withMessages([
                'receipt' => "Нельзя удалить приход: по партии #{$lot->id} есть резерв ({$lot->reserved_qty} шт.). Сначала снимите резерв с заказов, привязанных к этой партии.",
            ]);
        }

        if ((int) $lot->qty < $qty) {
            throw ValidationException::withMessages([
                'receipt' => "Нельзя удалить приход: по партии #{$lot->id} осталось {$lot->qty} шт., нужно {$qty}. Часть товара уже списана или израсходована.",
            ]);
        }

        $newQty = (int) $lot->qty - $qty;
        if ($newQty <= 0) {
            $lot->delete();
        } else {
            $lot->update(['qty' => $newQty]);
        }
    }

    /**
     * Жёсткий откат: снимаем только то, что ещё осталось на партии прихода.
     * Уже списанное/израсходованное не трогаем (лота может не быть).
     *
     * @return array{lot_id: int|null, qty: int, reserved: int}
     */
    public function forceDetachReceiptLot(StockReceiptItem $item, int $warehouseId): array
    {
        $lot = WarehouseStockLot::query()
            ->where('stock_receipt_item_id', $item->id)
            ->where('warehouse_id', $warehouseId)
            ->lockForUpdate()
            ->first();

        if (! $lot) {
            return ['lot_id' => null, 'qty' => 0, 'reserved' => 0];
        }

        $qty = max(0, (int) $lot->qty);
        $reserved = max(0, (int) $lot->reserved_qty);
        $lotId = (int) $lot->id;
        $lot->delete();

        return [
            'lot_id' => $lotId,
            'qty' => $qty,
            'reserved' => $reserved,
        ];
    }

    /**
     * @param  list<int|string>  $ids
     * @return list<int>
     */
    private function normalizeIds(array $ids): array
    {
        return array_values(array_unique(array_filter(
            array_map(static fn ($id): int => (int) $id, $ids),
            static fn (int $id): bool => $id > 0,
        )));
    }
}
