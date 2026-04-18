<?php

namespace Modules\Warehouse\Services;

use App\Services\AuditLogService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Warehouse\Models\StockMovement;
use Modules\Warehouse\Models\StockReservation;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Models\StockWriteoffItem;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class StockInventoryService
{
    public const MOVEMENT_RECEIPT = 'receipt';
    public const MOVEMENT_RESERVE = 'reserve';
    public const MOVEMENT_RELEASE = 'release';
    public const MOVEMENT_WRITEOFF = 'writeoff';

    public function getDefaultSupplierWarehouseId(): int
    {
        return (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');
    }

    public function getMainWarehouseId(): int
    {
        return (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
    }

    public function syncProductStockFlagsByProductId(int $productId): void
    {
        $product = Product::query()->find($productId);
        if (!$product) {
            return;
        }

        $stockSum = (int) WarehouseVariantStock::query()
            ->where('product_id', $productId)
            ->sum('stock');

        $product->update([
            'is_out_of_stock' => $stockSum <= 0,
        ]);
    }

    public function reserveForOrder(Order $order): array
    {
        $created = 0;
        $skipped = [];

        foreach ($order->items as $item) {
            $result = $this->reserveOrderItem($order, $item);
            if ($result['reserved']) {
                $created++;
            } elseif ($result['reason'] !== null) {
                $skipped[] = $result;
            }
        }

        $this->writeAudit(
            AuditLogService::ENTITY_STOCK_RESERVATION,
            null,
            AuditLogService::ACTION_CREATED,
            "Создан резерв по заказу #{$order->id}",
            [
                'order_id' => $order->id,
                'created_count' => $created,
                'skipped' => $skipped,
            ]
        );

        return [
            'created_count' => $created,
            'skipped' => $skipped,
        ];
    }

    public function releaseForOrder(Order $order, string $reason = 'cancelled'): array
    {
        $released = 0;

        $reservations = StockReservation::query()
            ->where('order_id', $order->id)
            ->where('status', 'active')
            ->get();

        foreach ($reservations as $reservation) {
            $variant = ProductVariantLink::query()->lockForUpdate()->find($reservation->variant_id);
            if (!$variant) {
                continue;
            }

            $warehouseId = (int) ($reservation->warehouse_id ?: $this->getDefaultSupplierWarehouseId());
            $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
            $beforeStock = (int) $warehouseStock->stock;
            $beforeReserved = (int) $warehouseStock->reserved_stock;
            $reservedDelta = -min((int) $reservation->qty, $beforeReserved);

            $warehouseStock->update([
                'reserved_stock' => max(0, $beforeReserved + $reservedDelta),
            ]);

            $reservation->update([
                'status' => 'released',
                'released_at' => now(),
                'payload' => array_merge($reservation->payload ?? [], [
                    'release_reason' => $reason,
                ]),
            ]);

            $this->createMovement(
                self::MOVEMENT_RELEASE,
                'order',
                $order->id,
                $warehouseId,
                $variant,
                0,
                $reservedDelta,
                [
                    'order_id' => $order->id,
                    'order_item_id' => $reservation->order_item_id,
                    'reason' => $reason,
                ],
                $beforeStock,
                $beforeReserved,
                (int) $warehouseStock->stock,
                (int) $warehouseStock->reserved_stock,
            );

            $this->syncVariantAggregates((int) $variant->id);
            $this->syncProductStockFlagsByProductId((int) $variant->product_id);
            $released++;
        }

        $this->writeAudit(
            AuditLogService::ENTITY_STOCK_RESERVATION,
            null,
            AuditLogService::ACTION_UPDATED,
            "Снят резерв по заказу #{$order->id}",
            [
                'order_id' => $order->id,
                'released_count' => $released,
                'reason' => $reason,
            ]
        );

        return [
            'released_count' => $released,
        ];
    }

    public function completeOrder(Order $order): array
    {
        $existingWriteoff = StockWriteoff::query()
            ->where('type', 'order')
            ->where('order_id', $order->id)
            ->first();
        if ($existingWriteoff) {
            return [
                'writeoff_id' => $existingWriteoff->id,
                'created' => false,
            ];
        }

        $writeoff = StockWriteoff::query()->create([
            'warehouse_id' => $this->getDefaultSupplierWarehouseId(),
            'type' => 'order',
            'order_id' => $order->id,
            'status' => 'posted',
            'written_off_at' => now(),
            'comment' => "Автосписание по заказу #{$order->id}",
            'created_by' => Auth::id(),
            'updated_by' => Auth::id(),
        ]);
        $writeoff->update(['document_no' => (string) $writeoff->id]);

        foreach ($order->items as $item) {
            if (!$item->variant_id || $item->qty <= 0) {
                continue;
            }

            $variant = ProductVariantLink::query()->lockForUpdate()->with('definition')->find($item->variant_id);
            if (!$variant) {
                continue;
            }

            $warehouseId = $this->resolveOrderWarehouseId($item, $variant);
            $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);

            $reservation = StockReservation::query()
                ->where('order_item_id', $item->id)
                ->where('variant_id', $variant->id)
                ->where('warehouse_id', $warehouseId)
                ->where('status', 'active')
                ->first();

            $beforeStock = (int) $warehouseStock->stock;
            $beforeReserved = (int) $warehouseStock->reserved_stock;
            $qty = (int) $item->qty;
            $reservedPart = min((int) ($reservation?->qty ?? 0), $qty);

            if ($beforeStock < $qty) {
                throw ValidationException::withMessages([
                    'status' => "Недостаточно остатка для списания варианта #{$variant->id}",
                ]);
            }
            if ($beforeReserved < $reservedPart) {
                throw ValidationException::withMessages([
                    'status' => "Недостаточно резерва для списания варианта #{$variant->id}",
                ]);
            }

            $warehouseStock->update([
                'stock' => $beforeStock - $qty,
                'reserved_stock' => $beforeReserved - $reservedPart,
            ]);

            StockWriteoffItem::query()->create([
                'stock_writeoff_id' => $writeoff->id,
                'product_id' => $item->product_id,
                'variant_id' => $variant->id,
                'product_name' => $item->product_name,
                'variant_title' => $item->variant_title,
                'qty' => $qty,
                'price' => $item->price,
                'payload' => [
                    'order_item_id' => $item->id,
                    'warehouse_id' => $warehouseId,
                ],
            ]);

            if ($reservation) {
                $reservation->update([
                    'status' => 'written_off',
                    'written_off_at' => now(),
                ]);
            }

            $this->createMovement(
                self::MOVEMENT_WRITEOFF,
                'stock_writeoff',
                $writeoff->id,
                $warehouseId,
                $variant,
                -$qty,
                -$reservedPart,
                [
                    'order_id' => $order->id,
                    'order_item_id' => $item->id,
                    'writeoff_type' => 'order',
                ],
                $beforeStock,
                $beforeReserved,
                (int) $warehouseStock->stock,
                (int) $warehouseStock->reserved_stock,
            );

            $this->syncVariantAggregates((int) $variant->id);
            $this->syncProductStockFlagsByProductId((int) $variant->product_id);
        }

        $this->writeAudit(
            AuditLogService::ENTITY_STOCK_WRITEOFF,
            $writeoff->id,
            AuditLogService::ACTION_CREATED,
            "Создано списание по заказу #{$order->id}",
            [
                'order_id' => $order->id,
                'writeoff_id' => $writeoff->id,
            ],
            (int) $writeoff->warehouse_id
        );

        return [
            'writeoff_id' => $writeoff->id,
            'created' => true,
        ];
    }

    public function createManualWriteoff(array $validated): StockWriteoff
    {
        return DB::transaction(function () use ($validated) {
            $warehouseId = (int) ($validated['warehouse_id'] ?? $this->getDefaultSupplierWarehouseId());
            $writeoff = StockWriteoff::query()->create([
                'warehouse_id' => $warehouseId,
                'type' => 'manual',
                'order_id' => null,
                'status' => 'posted',
                'written_off_at' => $validated['written_off_at'] ?? now(),
                'comment' => $validated['comment'] ?? null,
                'created_by' => Auth::id(),
                'updated_by' => Auth::id(),
            ]);
            $writeoff->update(['document_no' => (string) $writeoff->id]);

            $auditItems = [];

            foreach ($validated['items'] as $item) {
                $product = Product::query()->findOrFail((int) $item['product_id']);
                $variant = ProductVariantLink::query()
                    ->where('product_id', $product->id)
                    ->with('definition')
                    ->lockForUpdate()
                    ->findOrFail((int) $item['variant_id']);

                $qty = (int) $item['qty'];
                $price = array_key_exists('price', $item) ? (float) $item['price'] : null;

                StockWriteoffItem::query()->create([
                    'stock_writeoff_id' => $writeoff->id,
                    'product_id' => $product->id,
                    'variant_id' => $variant->id,
                    'product_name' => $product->name,
                    'variant_title' => $variant->title,
                    'qty' => $qty,
                    'price' => $price,
                    'payload' => array_merge($item['payload'] ?? [], ['warehouse_id' => $warehouseId]),
                ]);

                $this->decreaseVariantStock(
                    $variant,
                    $qty,
                    'stock_writeoff',
                    $writeoff->id,
                    [
                        'writeoff_type' => 'manual',
                        'comment' => $validated['comment'] ?? null,
                        'warehouse_id' => $warehouseId,
                    ],
                    $warehouseId
                );

                $auditItems[] = [
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'variant_id' => $variant->id,
                    'variant_title' => $variant->title,
                    'qty' => $qty,
                    'price' => $price,
                    'warehouse_id' => $warehouseId,
                ];
            }

            $this->writeAudit(
                AuditLogService::ENTITY_STOCK_WRITEOFF,
                $writeoff->id,
                AuditLogService::ACTION_CREATED,
                "Создано ручное списание #{$writeoff->document_no}",
                [
                    'writeoff_id' => $writeoff->id,
                    'document_no' => $writeoff->document_no,
                    'warehouse_id' => $warehouseId,
                    'warehouse_name' => Warehouse::query()->find($warehouseId)?->name,
                    'written_off_at' => $writeoff->written_off_at,
                    'items_count' => count($validated['items']),
                    'qty_total' => array_sum(array_map(static fn (array $line): int => (int) ($line['qty'] ?? 0), $validated['items'])),
                    'comment' => $validated['comment'] ?? null,
                    'items' => $auditItems,
                ],
                $warehouseId
            );

            return $writeoff->load('items');
        });
    }

    public function increaseVariantStock(
        ProductVariantLink $variant,
        int $qty,
        string $documentType,
        int $documentId,
        array $payload = [],
        ?int $warehouseId = null,
    ): void {
        if ($qty <= 0) {
            return;
        }

        $warehouseId = $warehouseId ?: (int) ($payload['warehouse_id'] ?? $this->getDefaultSupplierWarehouseId());
        $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
        $beforeStock = (int) $warehouseStock->stock;
        $beforeReserved = (int) $warehouseStock->reserved_stock;

        $warehouseStock->update([
            'stock' => $beforeStock + $qty,
        ]);

        $this->createMovement(
            self::MOVEMENT_RECEIPT,
            $documentType,
            $documentId,
            $warehouseId,
            $variant,
            $qty,
            0,
            $payload,
            $beforeStock,
            $beforeReserved,
            (int) $warehouseStock->stock,
            (int) $warehouseStock->reserved_stock,
        );

        $this->syncVariantAggregates((int) $variant->id);
        $this->syncProductStockFlagsByProductId((int) $variant->product_id);
    }

    public function decreaseVariantStock(
        ProductVariantLink $variant,
        int $qty,
        string $documentType,
        int $documentId,
        array $payload = [],
        ?int $warehouseId = null,
    ): void {
        if ($qty <= 0) {
            return;
        }

        $warehouseId = $warehouseId ?: (int) ($payload['warehouse_id'] ?? $this->getDefaultSupplierWarehouseId());
        $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
        $beforeStock = (int) $warehouseStock->stock;
        $beforeReserved = (int) $warehouseStock->reserved_stock;
        $afterStock = $beforeStock - $qty;

        if ($afterStock < 0 || $afterStock < $beforeReserved) {
            throw ValidationException::withMessages([
                'items' => "Нельзя уменьшить остаток варианта #{$variant->id}: есть резерв или остаток станет отрицательным",
            ]);
        }

        $warehouseStock->update([
            'stock' => $afterStock,
        ]);

        $this->createMovement(
            self::MOVEMENT_WRITEOFF,
            $documentType,
            $documentId,
            $warehouseId,
            $variant,
            -$qty,
            0,
            $payload,
            $beforeStock,
            $beforeReserved,
            (int) $warehouseStock->stock,
            (int) $warehouseStock->reserved_stock,
        );

        $this->syncVariantAggregates((int) $variant->id);
        $this->syncProductStockFlagsByProductId((int) $variant->product_id);
    }

    private function reserveOrderItem(Order $order, OrderItem $item): array
    {
        if (!$item->variant_id || $item->qty <= 0) {
            return ['reserved' => false, 'reason' => null];
        }

        $variant = ProductVariantLink::query()->lockForUpdate()->find($item->variant_id);
        if (!$variant || $variant->is_preorder) {
            return ['reserved' => false, 'reason' => 'preorder_or_missing'];
        }

        $warehouseId = $this->resolveOrderWarehouseId($item, $variant);

        $existingReservation = StockReservation::query()
            ->where('order_item_id', $item->id)
            ->where('variant_id', $variant->id)
            ->where('warehouse_id', $warehouseId)
            ->where('status', 'active')
            ->first();
        if ($existingReservation) {
            return [
                'reserved' => false,
                'reason' => 'already_reserved',
                'reservation_id' => $existingReservation->id,
            ];
        }

        $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
        $available = max(0, (int) $warehouseStock->stock - (int) $warehouseStock->reserved_stock);
        if ($available < (int) $item->qty) {
            return [
                'reserved' => false,
                'reason' => 'insufficient_stock',
                'variant_id' => $variant->id,
                'warehouse_id' => $warehouseId,
                'requested_qty' => (int) $item->qty,
                'available_qty' => $available,
            ];
        }

        $reservation = StockReservation::query()->create([
            'order_id' => $order->id,
            'order_item_id' => $item->id,
            'warehouse_id' => $warehouseId,
            'product_id' => $item->product_id,
            'variant_id' => $variant->id,
            'qty' => (int) $item->qty,
            'status' => 'active',
            'reserved_at' => now(),
            'released_at' => null,
            'written_off_at' => null,
            'payload' => [
                'variant_title' => $item->variant_title,
            ],
        ]);

        $beforeStock = (int) $warehouseStock->stock;
        $beforeReserved = (int) $warehouseStock->reserved_stock;
        $reservedDelta = (int) $item->qty;

        $warehouseStock->update([
            'reserved_stock' => $beforeReserved + $reservedDelta,
        ]);

        $this->createMovement(
            self::MOVEMENT_RESERVE,
            'order',
            $order->id,
            $warehouseId,
            $variant,
            0,
            $reservedDelta,
            [
                'order_id' => $order->id,
                'order_item_id' => $item->id,
                'reservation_id' => $reservation->id,
            ],
            $beforeStock,
            $beforeReserved,
            (int) $warehouseStock->stock,
            (int) $warehouseStock->reserved_stock,
        );

        $this->syncVariantAggregates((int) $variant->id);
        $this->syncProductStockFlagsByProductId((int) $variant->product_id);

        return [
            'reserved' => true,
            'reservation_id' => $reservation->id,
            'warehouse_id' => $warehouseId,
        ];
    }

    private function createMovement(
        string $type,
        string $documentType,
        int $documentId,
        int $warehouseId,
        ProductVariantLink $variant,
        int $stockDelta,
        int $reservedDelta,
        array $payload,
        int $beforeStock,
        int $beforeReserved,
        int $afterStock,
        int $afterReserved,
    ): void {
        StockMovement::query()->create([
            'type' => $type,
            'document_type' => $documentType,
            'document_id' => $documentId,
            'order_id' => $payload['order_id'] ?? null,
            'warehouse_id' => $warehouseId,
            'product_id' => $variant->product_id,
            'variant_id' => $variant->id,
            'stock_delta' => $stockDelta,
            'reserved_delta' => $reservedDelta,
            'stock_before' => $beforeStock,
            'stock_after' => $afterStock,
            'reserved_before' => $beforeReserved,
            'reserved_after' => $afterReserved,
            'payload' => $payload,
            'created_by' => Auth::id(),
        ]);
    }

    private function writeAudit(
        string $entityType,
        ?int $entityId,
        string $action,
        string $summary,
        array $context = [],
        ?int $warehouseId = null,
    ): void {
        try {
            app(AuditLogService::class)->record($entityType, $entityId, $action, $summary, $context, $warehouseId);
        } catch (\Throwable) {
        }
    }

    private function getWarehouseStock(
        int $warehouseId,
        int $productId,
        int $variantId,
        bool $lockForUpdate = false,
    ): WarehouseVariantStock {
        $query = WarehouseVariantStock::query()
            ->where('warehouse_id', $warehouseId)
            ->where('variant_id', $variantId);
        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        $stock = $query->first();
        if ($stock) {
            return $stock;
        }

        return WarehouseVariantStock::query()->create([
            'warehouse_id' => $warehouseId,
            'product_id' => $productId,
            'variant_id' => $variantId,
            'stock' => 0,
            'reserved_stock' => 0,
        ]);
    }

    private function syncVariantAggregates(int $variantId): void
    {
        $variant = ProductVariantLink::query()->find($variantId);
        if (!$variant) {
            return;
        }

        $totals = WarehouseVariantStock::query()
            ->where('variant_id', $variantId)
            ->selectRaw('COALESCE(SUM(stock), 0) as stock_total')
            ->selectRaw('COALESCE(SUM(reserved_stock), 0) as reserved_total')
            ->first();

        $variant->update([
            'stock' => (int) ($totals->stock_total ?? 0),
            'reserved_stock' => (int) ($totals->reserved_total ?? 0),
        ]);
    }

    private function resolveOrderWarehouseId(OrderItem $item, ProductVariantLink $variant): int
    {
        $mainWarehouseId = $this->getMainWarehouseId();
        if ($mainWarehouseId > 0) {
            $mainStock = WarehouseVariantStock::query()
                ->where('warehouse_id', $mainWarehouseId)
                ->where('variant_id', $variant->id)
                ->first();
            if ($mainStock && $mainStock->available_stock >= (int) $item->qty) {
                return $mainWarehouseId;
            }
        }

        return $this->getDefaultSupplierWarehouseId();
    }
}
