<?php

namespace Modules\Warehouse\Services;

use App\Services\AuditLogService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Services\Pricing\VariantPromotionService;
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
    public const MOVEMENT_WRITEOFF_REVERSAL = 'writeoff_reversal';

    public function getDefaultSupplierWarehouseId(): int
    {
        return (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');
    }

    public function getMainWarehouseId(): int
    {
        return (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
    }

    /**
     * Склад с кодом supplier: для заказов канал «виртуально в наличии» — списание заказа не уменьшает поле stock.
     */
    private function isOrderSupplierChannelWarehouse(int $warehouseId): bool
    {
        $supplierId = $this->getDefaultSupplierWarehouseId();

        return $supplierId > 0 && $warehouseId === $supplierId;
    }

    public function syncProductStockFlagsByProductId(int $productId): void
    {
        $product = Product::query()->find($productId);
        if (!$product) {
            return;
        }

        $mainWarehouseId = $this->getMainWarehouseId();
        $supplierWarehouseId = $this->getDefaultSupplierWarehouseId();

        $variants = ProductVariantLink::query()
            ->where('product_id', $productId)
            ->where(function ($q): void {
                $q->where('is_active', true)
                    ->orWhere('is_preorder', true);
            })
            ->get();

        if ($variants->isEmpty()) {
            $product->update(['is_out_of_stock' => true]);

            return;
        }

        $variantIds = $variants->pluck('id')->all();
        $stocks = WarehouseVariantStock::query()
            ->whereIn('variant_id', $variantIds)
            ->whereIn('warehouse_id', array_values(array_filter([$mainWarehouseId, $supplierWarehouseId])))
            ->get()
            ->groupBy('variant_id');

        $hasPurchasable = false;
        foreach ($variants as $variant) {
            if ($variant->is_preorder) {
                $hasPurchasable = true;
                break;
            }
            $variantStocks = $stocks->get($variant->id, collect())->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
            $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);
            if (!empty($presented['is_available'])) {
                $hasPurchasable = true;
                break;
            }
        }

        $product->update([
            'is_out_of_stock' => !$hasPurchasable,
        ]);
    }

    /**
     * Код отсутствует в прайсе поставщика: убираем свободный остаток на виртуальном складе supplier.
     * При нулевом резерве строка удаляется; при активных резервах — stock не ниже reserved (без «лишней» свободной штуки).
     *
     * @param  list<int>  $variantIds
     */
    public function clearSupplierWarehouseShelfForVariantIds(array $variantIds): void
    {
        $supplierWarehouseId = $this->getDefaultSupplierWarehouseId();
        if ($supplierWarehouseId <= 0 || $variantIds === []) {
            return;
        }

        $variantIds = array_values(array_unique(array_filter(array_map(static fn ($id): int => (int) $id, $variantIds))));

        foreach ($variantIds as $variantId) {
            $variant = ProductVariantLink::query()->find($variantId);
            if (!$variant) {
                continue;
            }

            $row = WarehouseVariantStock::query()
                ->where('warehouse_id', $supplierWarehouseId)
                ->where('variant_id', $variantId)
                ->first();

            if ($row) {
                $reserved = (int) $row->reserved_stock;
                $stock = (int) $row->stock;
                if ($reserved > 0) {
                    if ($stock < $reserved) {
                        $row->update(['stock' => $reserved]);
                    }
                } else {
                    $row->delete();
                }
            }

            $this->syncVariantAggregates($variantId);
            $this->syncProductStockFlagsByProductId((int) $variant->product_id);
        }
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

        $reserveDocument = $this->createOrderReserveDocument($order);

        $this->writeAudit(
            AuditLogService::ENTITY_STOCK_RESERVATION,
            null,
            AuditLogService::ACTION_CREATED,
            "Создан резерв по заказу #{$order->id}",
            [
                'order_id' => $order->id,
                'created_count' => $created,
                'skipped' => $skipped,
                'reserve_document_id' => $reserveDocument['document_id'],
                'reserve_document_created' => $reserveDocument['created'],
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

        // Раньше сюда всегда подставлялся склад «Поставщик» — в отчётах документ
        // выглядел неверно при смешанном заказе (часть с main, часть с supplier).
        // Шапка: основной склад, если по заказу есть резерв с main; иначе — supplier.
        $headerWarehouseId = $this->resolveOrderWriteoffHeaderWarehouseId($order);

        $writeoff = StockWriteoff::query()->create([
            'warehouse_id' => $headerWarehouseId,
            'type' => 'order',
            'order_id' => $order->id,
            'status' => StockWriteoff::STATUS_POSTED,
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

            $reservations = StockReservation::query()
                ->where('order_item_id', $item->id)
                ->where('variant_id', $variant->id)
                ->where('status', 'active')
                ->orderBy('id')
                ->get();

            if ($reservations->isEmpty()) {
                continue;
            }

            $totalWrittenOffQty = 0;
            $warehouseLines = [];

            foreach ($reservations as $reservation) {
                $warehouseId = (int) $reservation->warehouse_id;
                $lineQty = (int) $reservation->qty;
                if ($lineQty <= 0) {
                    continue;
                }

                $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
                $beforeStock = (int) $warehouseStock->stock;
                $beforeReserved = (int) $warehouseStock->reserved_stock;
                $reservedPart = min($lineQty, $beforeReserved);

                $supplierChannelWriteoff = $this->isOrderSupplierChannelWarehouse($warehouseId);

                if ($supplierChannelWriteoff) {
                    // Канал «Поставщик»: остаток на этом складе виртуальный для заказов — не уменьшаем stock при отгрузке,
                    // только снимаем резерв (физику на основном складе по-прежнему ведём отдельно).
                    if ($beforeReserved < $reservedPart) {
                        throw ValidationException::withMessages([
                            'status' => "Недостаточно резерва для закрытия варианта #{$variant->id} на складе поставщика #{$warehouseId}",
                        ]);
                    }

                    $warehouseStock->update([
                        'stock' => $beforeStock,
                        'reserved_stock' => $beforeReserved - $reservedPart,
                    ]);
                } else {
                    if ($beforeStock < $lineQty) {
                        throw ValidationException::withMessages([
                            'status' => "Недостаточно остатка для списания варианта #{$variant->id} на складе #{$warehouseId}",
                        ]);
                    }
                    if ($beforeReserved < $reservedPart) {
                        throw ValidationException::withMessages([
                            'status' => "Недостаточно резерва для списания варианта #{$variant->id} на складе #{$warehouseId}",
                        ]);
                    }

                    $warehouseStock->update([
                        'stock' => $beforeStock - $lineQty,
                        'reserved_stock' => $beforeReserved - $reservedPart,
                    ]);
                }

                $reservation->update([
                    'status' => 'written_off',
                    'written_off_at' => now(),
                ]);

                $stockDelta = $supplierChannelWriteoff ? 0 : -$lineQty;

                $this->createMovement(
                    self::MOVEMENT_WRITEOFF,
                    'stock_writeoff',
                    $writeoff->id,
                    $warehouseId,
                    $variant,
                    $stockDelta,
                    -$reservedPart,
                    array_merge([
                        'order_id' => $order->id,
                        'order_item_id' => $item->id,
                        'reservation_id' => $reservation->id,
                        'writeoff_type' => 'order',
                    ], $supplierChannelWriteoff ? ['supplier_virtual_writeoff' => true] : []),
                    $beforeStock,
                    $beforeReserved,
                    (int) $warehouseStock->stock,
                    (int) $warehouseStock->reserved_stock,
                );

                $totalWrittenOffQty += $lineQty;
                $warehouseLines[] = [
                    'warehouse_id' => $warehouseId,
                    'qty' => $lineQty,
                    'reservation_id' => $reservation->id,
                ];
            }

            if ($totalWrittenOffQty > 0) {
                StockWriteoffItem::query()->create([
                    'stock_writeoff_id' => $writeoff->id,
                    'product_id' => $item->product_id,
                    'variant_id' => $variant->id,
                    'product_name' => $item->product_name,
                    'variant_title' => $item->variant_title,
                    'qty' => $totalWrittenOffQty,
                    'price' => $item->price,
                    'payload' => [
                        'order_item_id' => $item->id,
                        'order_qty' => (int) $item->qty,
                        'warehouse_lines' => $warehouseLines,
                    ],
                ]);
            }

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
                'status' => StockWriteoff::STATUS_POSTED,
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

                $stockSource = $item['stock_source'] ?? 'available';
                if (!in_array($stockSource, ['available', 'reserved'], true)) {
                    $stockSource = 'available';
                }

                StockWriteoffItem::query()->create([
                    'stock_writeoff_id' => $writeoff->id,
                    'product_id' => $product->id,
                    'variant_id' => $variant->id,
                    'product_name' => \Modules\Catalog\Support\ProductDisplayName::forProduct($product),
                    'variant_title' => $variant->title,
                    'qty' => $qty,
                    'price' => $price,
                    'payload' => array_merge($item['payload'] ?? [], [
                        'warehouse_id' => $warehouseId,
                        'stock_source' => $stockSource,
                    ]),
                ]);

                $this->applyManualWriteoffLine(
                    $variant,
                    $qty,
                    $stockSource,
                    'stock_writeoff',
                    $writeoff->id,
                    [
                        'writeoff_type' => 'manual',
                        'comment' => $validated['comment'] ?? null,
                        'warehouse_id' => $warehouseId,
                        'stock_source' => $stockSource,
                    ],
                    $warehouseId
                );

                $auditItems[] = [
                    'product_id' => $product->id,
                    'product_name' => \Modules\Catalog\Support\ProductDisplayName::forProduct($product),
                    'variant_id' => $variant->id,
                    'variant_title' => $variant->title,
                    'qty' => $qty,
                    'price' => $price,
                    'warehouse_id' => $warehouseId,
                    'stock_source' => $stockSource,
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

    public function createManualReserve(array $validated): StockWriteoff
    {
        return DB::transaction(function () use ($validated) {
            $warehouseId = (int) ($validated['warehouse_id'] ?? $this->getDefaultSupplierWarehouseId());
            $writeoff = StockWriteoff::query()->create([
                'warehouse_id' => $warehouseId,
                'type' => 'reserve',
                'order_id' => null,
                'status' => StockWriteoff::STATUS_POSTED,
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
                    'product_name' => \Modules\Catalog\Support\ProductDisplayName::forProduct($product),
                    'variant_title' => $variant->title,
                    'qty' => $qty,
                    'price' => $price,
                    'payload' => array_merge($item['payload'] ?? [], [
                        'warehouse_id' => $warehouseId,
                        'stock_source' => 'available',
                        'reserve_document' => true,
                    ]),
                ]);

                $this->applyManualReserveLine(
                    $variant,
                    $qty,
                    'stock_writeoff',
                    $writeoff->id,
                    [
                        'reserve_type' => 'manual',
                        'comment' => $validated['comment'] ?? null,
                        'warehouse_id' => $warehouseId,
                    ],
                    $warehouseId
                );

                $auditItems[] = [
                    'product_id' => $product->id,
                    'product_name' => \Modules\Catalog\Support\ProductDisplayName::forProduct($product),
                    'variant_id' => $variant->id,
                    'variant_title' => $variant->title,
                    'qty' => $qty,
                    'price' => $price,
                    'warehouse_id' => $warehouseId,
                ];
            }

            $this->writeAudit(
                AuditLogService::ENTITY_STOCK_RESERVATION,
                $writeoff->id,
                AuditLogService::ACTION_CREATED,
                "Создан ручной резерв #{$writeoff->document_no}",
                [
                    'reserve_document_id' => $writeoff->id,
                    'document_no' => $writeoff->document_no,
                    'warehouse_id' => $warehouseId,
                    'warehouse_name' => Warehouse::query()->find($warehouseId)?->name,
                    'reserved_at' => $writeoff->written_off_at,
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

    /**
     * Есть ли движения списания, которые можно откатить (все кроме виртуального склада поставщика).
     */
    public function canReverseWriteoff(StockWriteoff $writeoff): bool
    {
        if ($writeoff->status !== StockWriteoff::STATUS_POSTED) {
            return false;
        }

        $supplierId = $this->getDefaultSupplierWarehouseId();

        return StockMovement::query()
            ->where('document_type', 'stock_writeoff')
            ->where('document_id', $writeoff->id)
            ->where('type', self::MOVEMENT_WRITEOFF)
            ->where('warehouse_id', '!=', $supplierId)
            ->exists();
    }

    /**
     * Отмена списания: возврат остатка по движениям на физических складах (не supplier).
     * Движения на складе поставщика не меняются.
     */
    public function reverseWriteoff(int $writeoffId): StockWriteoff
    {
        return DB::transaction(function () use ($writeoffId) {
            $writeoff = StockWriteoff::query()->lockForUpdate()->findOrFail($writeoffId);
            if ($writeoff->status !== StockWriteoff::STATUS_POSTED) {
                throw ValidationException::withMessages([
                    'writeoff' => 'Отменить можно только проведённое списание',
                ]);
            }

            $supplierId = $this->getDefaultSupplierWarehouseId();
            $movements = StockMovement::query()
                ->where('document_type', 'stock_writeoff')
                ->where('document_id', $writeoff->id)
                ->where('type', self::MOVEMENT_WRITEOFF)
                ->where('warehouse_id', '!=', $supplierId)
                ->orderByDesc('id')
                ->get();

            if ($movements->isEmpty()) {
                throw ValidationException::withMessages([
                    'writeoff' => 'Нет движений для отмены на физических складах (склад поставщика не отменяется)',
                ]);
            }

            foreach ($movements as $movement) {
                $variant = ProductVariantLink::query()->lockForUpdate()->find($movement->variant_id);
                if (!$variant) {
                    continue;
                }

                $warehouseId = (int) $movement->warehouse_id;
                $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
                $beforeStock = (int) $warehouseStock->stock;
                $beforeReserved = (int) $warehouseStock->reserved_stock;
                $stockDelta = (int) $movement->stock_delta;
                $reservedDelta = (int) $movement->reserved_delta;

                $afterStock = $beforeStock - $stockDelta;
                $afterReserved = $beforeReserved - $reservedDelta;
                if ($afterStock < 0) {
                    throw ValidationException::withMessages([
                        'writeoff' => "Нельзя отменить списание: остаток варианта #{$variant->id} на складе #{$warehouseId} стал бы отрицательным",
                    ]);
                }
                if ($afterReserved < 0) {
                    throw ValidationException::withMessages([
                        'writeoff' => "Нельзя отменить списание: резерв варианта #{$variant->id} на складе #{$warehouseId} стал бы отрицательным",
                    ]);
                }
                if ($afterReserved > $afterStock) {
                    $afterReserved = $afterStock;
                }

                $warehouseStock->update([
                    'stock' => $afterStock,
                    'reserved_stock' => $afterReserved,
                ]);

                $this->createMovement(
                    self::MOVEMENT_WRITEOFF_REVERSAL,
                    'stock_writeoff',
                    $writeoff->id,
                    $warehouseId,
                    $variant,
                    -$stockDelta,
                    -$reservedDelta,
                    [
                        'reversed_movement_id' => $movement->id,
                        'writeoff_id' => $writeoff->id,
                    ],
                    $beforeStock,
                    $beforeReserved,
                    (int) $warehouseStock->stock,
                    (int) $warehouseStock->reserved_stock,
                );

                $this->syncVariantAggregates((int) $variant->id);
                $this->syncProductStockFlagsByProductId((int) $variant->product_id);
            }

            $writeoff->update([
                'status' => StockWriteoff::STATUS_REVERSED,
                'updated_by' => Auth::id(),
            ]);

            $this->writeAudit(
                AuditLogService::ENTITY_STOCK_WRITEOFF,
                $writeoff->id,
                AuditLogService::ACTION_UPDATED,
                "Отменено списание #{$writeoff->document_no}",
                [
                    'writeoff_id' => $writeoff->id,
                    'movements_reversed' => $movements->count(),
                    'skipped_supplier_warehouse_id' => $supplierId,
                ],
                (int) $writeoff->warehouse_id
            );

            return $writeoff->fresh(['warehouse', 'items']);
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

    private function applyManualWriteoffLine(
        ProductVariantLink $variant,
        int $qty,
        string $stockSource,
        string $documentType,
        int $documentId,
        array $payload,
        int $warehouseId,
    ): void {
        if ($qty <= 0) {
            return;
        }

        if ($stockSource === 'reserved') {
            $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
            $beforeStock = (int) $warehouseStock->stock;
            $beforeReserved = (int) $warehouseStock->reserved_stock;

            if ($beforeReserved < $qty) {
                throw ValidationException::withMessages([
                    'items' => "Недостаточно резерва для списания варианта #{$variant->id} на складе #{$warehouseId}",
                ]);
            }
            if ($beforeStock < $qty) {
                throw ValidationException::withMessages([
                    'items' => "Недостаточно остатка для списания из резерва варианта #{$variant->id} на складе #{$warehouseId}",
                ]);
            }

            $afterStock = $beforeStock - $qty;
            $afterReserved = $beforeReserved - $qty;

            $warehouseStock->update([
                'stock' => $afterStock,
                'reserved_stock' => $afterReserved,
            ]);

            $this->createMovement(
                self::MOVEMENT_WRITEOFF,
                $documentType,
                $documentId,
                $warehouseId,
                $variant,
                -$qty,
                -$qty,
                $payload,
                $beforeStock,
                $beforeReserved,
                (int) $warehouseStock->stock,
                (int) $warehouseStock->reserved_stock,
            );

            $this->syncVariantAggregates((int) $variant->id);
            $this->syncProductStockFlagsByProductId((int) $variant->product_id);

            return;
        }

        $this->decreaseVariantStock($variant, $qty, $documentType, $documentId, $payload, $warehouseId);
    }

    private function applyManualReserveLine(
        ProductVariantLink $variant,
        int $qty,
        string $documentType,
        int $documentId,
        array $payload,
        int $warehouseId,
    ): void {
        if ($qty <= 0) {
            return;
        }

        $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
        $beforeStock = (int) $warehouseStock->stock;
        $beforeReserved = (int) $warehouseStock->reserved_stock;
        $available = max(0, $beforeStock - $beforeReserved);

        if ($available < $qty) {
            throw ValidationException::withMessages([
                'items' => "Недостаточно свободного остатка для резерва варианта #{$variant->id} на складе #{$warehouseId}",
            ]);
        }

        $warehouseStock->update([
            'reserved_stock' => $beforeReserved + $qty,
        ]);

        $this->createMovement(
            self::MOVEMENT_RESERVE,
            $documentType,
            $documentId,
            $warehouseId,
            $variant,
            0,
            $qty,
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

        $qty = (int) $item->qty;
        $availabilitySource = (string) ($item->availability_source ?? 'unavailable');
        $waitingDiscount = (bool) $item->waiting_discount;

        // Резервируем только физический остаток на основном складе без скидки за ожидание.
        // Всё, что по каналу поставщика (supplier_only / supplier_warehouse / waiting_discount),
        // остаётся без резерва — учёт продажи ведётся по OrderItem.
        $canReserveMain = in_array($availabilitySource, ['main', 'main+supplier'], true) && !$waitingDiscount;

        if (!$canReserveMain) {
            return [
                'reserved' => false,
                'reason' => 'virtual_supplier_channel',
                'variant_id' => $variant->id,
                'requested_qty' => $qty,
                'main_reserved_qty' => 0,
            ];
        }

        $mainWarehouseId = $this->getMainWarehouseId();
        if ($mainWarehouseId <= 0) {
            return [
                'reserved' => false,
                'reason' => 'no_main_warehouse',
                'variant_id' => $variant->id,
                'requested_qty' => $qty,
                'main_reserved_qty' => 0,
            ];
        }

        $mainStock = $this->getWarehouseStock($mainWarehouseId, (int) $variant->product_id, (int) $variant->id, true);
        $mainAvailable = max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock);
        $mainQty = min($qty, $mainAvailable);

        if ($mainQty <= 0) {
            return [
                'reserved' => false,
                'reason' => 'main_stock_unavailable',
                'variant_id' => $variant->id,
                'requested_qty' => $qty,
                'main_reserved_qty' => 0,
            ];
        }

        $r = $this->placeWarehouseReservation($order, $item, $variant, $mainWarehouseId, $mainQty, false);

        if (!empty($r['reserved'])) {
            $this->syncVariantAggregates((int) $variant->id);
            $this->syncProductStockFlagsByProductId((int) $variant->product_id);
        }

        return [
            'reserved' => !empty($r['reserved']),
            'reason' => empty($r['reserved']) ? ($r['reason'] ?? 'nothing_to_reserve') : null,
            'variant_id' => $variant->id,
            'requested_qty' => $qty,
            'main_reserved_qty' => !empty($r['reserved']) ? $mainQty : 0,
            'details' => [$r],
        ];
    }

    /**
     * @return array{reserved: bool, reason?: string|null, reservation_id?: int, warehouse_id?: int}
     */
    private function placeWarehouseReservation(
        Order $order,
        OrderItem $item,
        ProductVariantLink $variant,
        int $warehouseId,
        int $qty,
        bool $virtualInfiniteStock,
    ): array {
        if ($qty <= 0 || $warehouseId <= 0) {
            return ['reserved' => false, 'reason' => 'invalid_qty_or_warehouse'];
        }

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
                'warehouse_id' => $warehouseId,
            ];
        }

        $warehouseStock = $this->getWarehouseStock($warehouseId, (int) $variant->product_id, (int) $variant->id, true);
        $beforeStock = (int) $warehouseStock->stock;
        $beforeReserved = (int) $warehouseStock->reserved_stock;

        if ($virtualInfiniteStock) {
            $needStock = $beforeReserved + $qty;
            if ($beforeStock < $needStock) {
                $warehouseStock->update(['stock' => $needStock]);
                $warehouseStock->refresh();
                $beforeStock = (int) $warehouseStock->stock;
                $beforeReserved = (int) $warehouseStock->reserved_stock;
            }
        } else {
            $available = max(0, $beforeStock - $beforeReserved);
            if ($available < $qty) {
                return [
                    'reserved' => false,
                    'reason' => 'insufficient_stock',
                    'variant_id' => $variant->id,
                    'warehouse_id' => $warehouseId,
                    'requested_qty' => $qty,
                    'available_qty' => $available,
                ];
            }
        }

        $reservation = StockReservation::query()->create([
            'order_id' => $order->id,
            'order_item_id' => $item->id,
            'warehouse_id' => $warehouseId,
            'product_id' => $item->product_id,
            'variant_id' => $variant->id,
            'qty' => $qty,
            'status' => 'active',
            'reserved_at' => now(),
            'released_at' => null,
            'written_off_at' => null,
            'payload' => [
                'variant_title' => $item->variant_title,
                'virtual_infinite' => $virtualInfiniteStock,
            ],
        ]);

        $warehouseStock->update([
            'reserved_stock' => $beforeReserved + $qty,
        ]);
        $warehouseStock->refresh();

        $this->createMovement(
            self::MOVEMENT_RESERVE,
            'order',
            $order->id,
            $warehouseId,
            $variant,
            0,
            $qty,
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

        return [
            'reserved' => true,
            'reservation_id' => $reservation->id,
            'warehouse_id' => $warehouseId,
            'qty' => $qty,
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

        // Агрегат на product_variant_links — только «наши полки» (main и др. кроме supplier).
        // Склад supplier: отдельный учёт резерва/списаний; не суммируем в витринный stock,
        // иначе резерв по поставщику обнуляет available на карточке товара.
        $supplierWarehouseId = $this->getDefaultSupplierWarehouseId();
        $totalsQuery = WarehouseVariantStock::query()->where('variant_id', $variantId);
        if ($supplierWarehouseId > 0) {
            $totalsQuery->where('warehouse_id', '!=', $supplierWarehouseId);
        }

        $totals = $totalsQuery
            ->selectRaw('COALESCE(SUM(stock), 0) as stock_total')
            ->selectRaw('COALESCE(SUM(reserved_stock), 0) as reserved_total')
            ->first();

        $variant->update([
            'stock' => (int) ($totals->stock_total ?? 0),
            'reserved_stock' => (int) ($totals->reserved_total ?? 0),
        ]);

        app(VariantPromotionService::class)->clearPromotionIfMainWarehouseEmpty(
            $variantId,
            $this->getMainWarehouseId(),
        );
    }

    /**
     * Склад в шапке списания по заказу (движения всё равно идут по warehouse_id из резерва).
     * Если в заказе есть резерв на main — показываем основной склад; иначе канал поставщика.
     */
    private function resolveOrderWriteoffHeaderWarehouseId(Order $order): int
    {
        $mainId = $this->getMainWarehouseId();
        if ($mainId > 0) {
            $hasMainReservation = StockReservation::query()
                ->where('order_id', $order->id)
                ->where('status', 'active')
                ->where('warehouse_id', $mainId)
                ->exists();
            if ($hasMainReservation) {
                return $mainId;
            }
        }

        $supplierId = $this->getDefaultSupplierWarehouseId();

        return $supplierId > 0 ? $supplierId : $mainId;
    }

    /**
     * Создаёт документ резерва по заказу (для отображения в админке),
     * если его ещё нет. Не меняет остатки — это только журнал документа.
     *
     * @return array{document_id: ?int, created: bool}
     */
    private function createOrderReserveDocument(Order $order): array
    {
        $existing = StockWriteoff::query()
            ->where('type', 'reserve')
            ->where('order_id', $order->id)
            ->first();
        if ($existing) {
            return [
                'document_id' => (int) $existing->id,
                'created' => false,
            ];
        }

        $reservations = StockReservation::query()
            ->where('order_id', $order->id)
            ->where('status', 'active')
            ->orderBy('id')
            ->get();
        if ($reservations->isEmpty()) {
            return [
                'document_id' => null,
                'created' => false,
            ];
        }

        $headerWarehouseId = $this->resolveOrderWriteoffHeaderWarehouseId($order);
        // FK `warehouses`: 0 невалиден (даёт SQL 500 при пустой конфигурации складов).
        $warehouseIdForHeader = $headerWarehouseId > 0 ? $headerWarehouseId : null;
        $writeoff = StockWriteoff::query()->create([
            'warehouse_id' => $warehouseIdForHeader,
            'type' => 'reserve',
            'order_id' => $order->id,
            'status' => StockWriteoff::STATUS_POSTED,
            'written_off_at' => now(),
            'comment' => "Автоматический резерв по заказу #{$order->id}",
            'created_by' => Auth::id(),
            'updated_by' => Auth::id(),
        ]);
        $writeoff->update(['document_no' => (string) $writeoff->id]);

        $orderItems = $order->relationLoaded('items')
            ? $order->items->keyBy('id')
            : OrderItem::query()->where('order_id', $order->id)->get()->keyBy('id');

        $byOrderItem = $reservations->groupBy('order_item_id');
        foreach ($byOrderItem as $orderItemId => $group) {
            $orderItem = $orderItems->get((int) $orderItemId);
            $first = $group->first();
            if (!$orderItem || !$first) {
                continue;
            }

            $qty = (int) $group->sum('qty');
            if ($qty <= 0) {
                continue;
            }

            $warehouseLines = $group->map(static function (StockReservation $reservation): array {
                return [
                    'warehouse_id' => (int) $reservation->warehouse_id,
                    'qty' => (int) $reservation->qty,
                    'reservation_id' => (int) $reservation->id,
                ];
            })->values()->all();

            StockWriteoffItem::query()->create([
                'stock_writeoff_id' => $writeoff->id,
                'product_id' => (int) $orderItem->product_id,
                'variant_id' => (int) $first->variant_id,
                'product_name' => (string) $orderItem->product_name,
                'variant_title' => (string) $orderItem->variant_title,
                'qty' => $qty,
                'price' => $orderItem->price,
                'payload' => [
                    'order_item_id' => (int) $orderItem->id,
                    'order_qty' => (int) $orderItem->qty,
                    'stock_source' => 'reserved',
                    'reserve_document' => true,
                    'warehouse_lines' => $warehouseLines,
                ],
            ]);
        }

        $this->writeAudit(
            AuditLogService::ENTITY_STOCK_WRITEOFF,
            $writeoff->id,
            AuditLogService::ACTION_CREATED,
            "Создан документ резерва по заказу #{$order->id}",
            [
                'order_id' => $order->id,
                'reserve_document_id' => $writeoff->id,
            ],
            (int) $writeoff->warehouse_id
        );

        return [
            'document_id' => (int) $writeoff->id,
            'created' => true,
        ];
    }

}
