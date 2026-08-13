<?php

namespace Modules\Warehouse\Services;

use App\Services\AuditLogService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Support\VariantDefinitionVolume;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePricingService;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptItem;
use Modules\Warehouse\Models\StockReservation;
use Modules\Warehouse\Models\Warehouse;

class StockReceiptService
{
    public function __construct(
        private readonly StockInventoryService $inventoryService,
        private readonly SellerOnePricingService $pricingService,
        private readonly StockLotService $stockLotService,
    ) {
    }

    public function store(array $validated): StockReceipt
    {
        return DB::transaction(function () use ($validated) {
            $warehouseId = (int) ($validated['warehouse_id'] ?? $this->inventoryService->getDefaultSupplierWarehouseId());
            $receipt = StockReceipt::query()->create([
                'warehouse_id' => $warehouseId,
                'supplier_id' => $validated['supplier_id'] ?? null,
                'supplier_code' => $validated['supplier_code'] ?? null,
                'supplier_name' => trim((string) $validated['supplier_name']),
                'status' => StockReceipt::STATUS_DRAFT,
                'received_at' => $validated['received_at'] ?? now(),
                'comment' => $validated['comment'] ?? null,
                'created_by' => Auth::id(),
                'updated_by' => Auth::id(),
            ]);

            $receipt->update([
                'document_no' => (string) $receipt->id,
            ]);

            $items = $this->storeReceiptItems($receipt, $validated['items'], false);

            $this->writeAudit(
                AuditLogService::ENTITY_STOCK_RECEIPT,
                $receipt->id,
                AuditLogService::ACTION_CREATED,
                "Создан черновик прихода #{$receipt->document_no}",
                [
                    'supplier_name' => $receipt->supplier_name,
                    'items_count' => count($items),
                    'warehouse_id' => $warehouseId,
                    'warehouse_name' => Warehouse::query()->find($warehouseId)?->name,
                ],
                $warehouseId
            );

            return $receipt->load(['supplier', 'items']);
        });
    }

    /**
     * Проводка: движение остатков и цены (как при старом «немедленном» приходе).
     */
    public function post(StockReceipt $receipt): StockReceipt
    {
        return $this->inventoryService->runWithCatalogCacheCommit(function () use ($receipt): StockReceipt {
            return DB::transaction(function () use ($receipt): StockReceipt {
                return $this->postInTransaction($receipt);
            });
        });
    }

    /**
     * Проводка внутри уже открытой транзакции / catalog-cache commit.
     *
     * Передайте $receipt->setAttribute('skip_retail_price_update', true),
     * чтобы не пересчитывать розничную цену (закупка в лоты сохраняется).
     */
    public function postInTransaction(StockReceipt $receipt): StockReceipt
    {
        $updateRetailPrice = ! (bool) $receipt->getAttribute('skip_retail_price_update');
        $receipt->offsetUnset('skip_retail_price_update');

        if ($receipt->status !== StockReceipt::STATUS_DRAFT) {
            abort(422, 'Можно провести только черновик прихода');
        }

        $receipt->load('items');
        if ($receipt->items->isEmpty()) {
            abort(422, 'Нельзя провести пустой приход');
        }

        foreach ($receipt->items as $item) {
            $this->applyPostedInventoryForItem($receipt, $item, $updateRetailPrice);
        }

        $receipt->update([
            'status' => StockReceipt::STATUS_POSTED,
            'updated_by' => Auth::id(),
        ]);

        $receipt->refresh();

        $this->writeAudit(
            AuditLogService::ENTITY_STOCK_RECEIPT,
            $receipt->id,
            AuditLogService::ACTION_UPDATED,
            "Проведён приход (оприходован) #{$receipt->document_no}",
            [
                'supplier_name' => $receipt->supplier_name,
                'items_count' => $receipt->items->count(),
                'warehouse_id' => $receipt->warehouse_id,
                'warehouse_name' => Warehouse::query()->find((int) $receipt->warehouse_id)?->name,
            ],
            (int) $receipt->warehouse_id
        );

        return $receipt->fresh(['supplier', 'items']);
    }

    /**
     * Добавление строк в черновик (импорт XLS пакетами).
     *
     * @param  list<array<string, mixed>>  $items
     */
    public function appendDraftItems(StockReceipt $receipt, array $items): StockReceipt
    {
        return DB::transaction(function () use ($receipt, $items) {
            if ($receipt->status !== StockReceipt::STATUS_DRAFT) {
                abort(422, 'В документ можно добавлять строки только пока он в статусе «Черновик».');
            }

            $stored = $this->storeReceiptItems($receipt, $items, false);

            $receipt->update([
                'updated_by' => Auth::id(),
            ]);

            $this->writeAudit(
                AuditLogService::ENTITY_STOCK_RECEIPT,
                $receipt->id,
                AuditLogService::ACTION_UPDATED,
                "В приход #{$receipt->document_no} добавлены строки из импорта",
                [
                    'added_items_count' => count($stored),
                    'warehouse_id' => $receipt->warehouse_id,
                ],
                (int) $receipt->warehouse_id
            );

            return $receipt->fresh(['supplier', 'items']);
        });
    }

    public function update(StockReceipt $receipt, array $validated): StockReceipt
    {
        return DB::transaction(function () use ($receipt, $validated) {
            if ($receipt->status === StockReceipt::STATUS_POSTED) {
                abort(422, 'Нельзя изменить оприходованный документ. Отмена проводки пока недоступна.');
            }

            $receipt->load('items');
            $receipt->items()->delete();

            $receipt->update([
                'warehouse_id' => $validated['warehouse_id'] ?? $receipt->warehouse_id ?? $this->inventoryService->getDefaultSupplierWarehouseId(),
                'supplier_id' => $validated['supplier_id'] ?? null,
                'supplier_code' => $validated['supplier_code'] ?? null,
                'supplier_name' => trim((string) $validated['supplier_name']),
                'received_at' => $validated['received_at'] ?? $receipt->received_at ?? now(),
                'comment' => $validated['comment'] ?? null,
                'updated_by' => Auth::id(),
            ]);

            $items = $this->storeReceiptItems($receipt, $validated['items'], false);

            $this->writeAudit(
                AuditLogService::ENTITY_STOCK_RECEIPT,
                $receipt->id,
                AuditLogService::ACTION_UPDATED,
                "Обновлён черновик прихода #{$receipt->document_no}",
                [
                    'supplier_name' => $receipt->supplier_name,
                    'items_count' => count($items),
                    'warehouse_id' => $receipt->warehouse_id,
                    'warehouse_name' => Warehouse::query()->find($receipt->warehouse_id)?->name,
                ],
                (int) $receipt->warehouse_id
            );

            return $receipt->fresh(['supplier', 'items']);
        });
    }

    public function destroy(StockReceipt $receipt): void
    {
        $this->inventoryService->runWithCatalogCacheCommit(function () use ($receipt): void {
            DB::transaction(function () use ($receipt): void {
            $receipt->load('items');
            if ($receipt->status === StockReceipt::STATUS_POSTED) {
                $this->rollbackItems($receipt);
            }
            $receipt->items()->delete();
            $receiptId = $receipt->id;
            $documentNo = $receipt->document_no;
            $receipt->delete();

            $this->writeAudit(
                AuditLogService::ENTITY_STOCK_RECEIPT,
                $receiptId,
                AuditLogService::ACTION_DELETED,
                "Удален приход #{$documentNo}",
                [
                    'receipt_id' => $receiptId,
                    'warehouse_id' => $receipt->warehouse_id,
                ],
                (int) $receipt->warehouse_id
            );
            });
        });
    }

    /**
     * Принудительное удаление: откатывает только оставшиеся qty партий прихода
     * (уже списанное не вычитается повторно). Резерв с партий снимается вместе с ними.
     */
    public function destroyHard(StockReceipt $receipt): void
    {
        $this->inventoryService->runWithCatalogCacheCommit(function () use ($receipt): void {
            DB::transaction(function () use ($receipt): void {
                $receipt->load('items');
                if ($receipt->status === StockReceipt::STATUS_POSTED) {
                    $this->hardRollbackItems($receipt);
                }
                $receipt->items()->delete();
                $receiptId = $receipt->id;
                $documentNo = $receipt->document_no;
                $receipt->delete();

                $this->writeAudit(
                    AuditLogService::ENTITY_STOCK_RECEIPT,
                    $receiptId,
                    AuditLogService::ACTION_DELETED,
                    "Принудительно удалён приход #{$documentNo}",
                    [
                        'receipt_id' => $receiptId,
                        'warehouse_id' => $receipt->warehouse_id,
                        'hard' => true,
                    ],
                    (int) $receipt->warehouse_id
                );
            });
        });
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return list<StockReceiptItem>
     */
    private function storeReceiptItems(StockReceipt $receipt, array $items, bool $applyInventory): array
    {
        $stored = [];

        foreach ($items as $item) {
            $storedItem = $this->createReceiptItemRecord($receipt, $item);
            if ($applyInventory) {
                $this->applyPostedInventoryForItem($receipt, $storedItem);
            }
            $stored[] = $storedItem;
        }

        return $stored;
    }

    private function createReceiptItemRecord(StockReceipt $receipt, array $item): StockReceiptItem
    {
        $product = Product::query()->findOrFail((int) $item['product_id']);
        $variant = $this->resolveVariant($product, $item);

        $qty = (int) $item['qty'];
        $supplierPrice = round((float) $item['supplier_price'], 2);

        return StockReceiptItem::query()->create([
            'stock_receipt_id' => $receipt->id,
            'product_id' => $product->id,
            'variant_id' => $variant->id,
            'product_name' => \Modules\Catalog\Support\ProductDisplayName::forProduct($product),
            'variant_title' => $variant->title,
            'qty' => $qty,
            'supplier_price' => $supplierPrice,
            'line_total' => round($qty * $supplierPrice, 2),
            'supplier_sku' => trim((string) ($item['supplier_sku'] ?? '')) ?: null,
            'payload' => $item['payload'] ?? null,
        ]);
    }

    private function applyPostedInventoryForItem(
        StockReceipt $receipt,
        StockReceiptItem $storedItem,
        bool $updateRetailPrice = true,
    ): void {
        $variant = ProductVariantLink::query()->findOrFail((int) $storedItem->variant_id);

        $qty = (int) $storedItem->qty;
        $supplierPrice = round((float) $storedItem->supplier_price, 2);
        $isMainWarehouseReceipt = (int) $receipt->warehouse_id === $this->inventoryService->getMainWarehouseId();

        $retailPrice = null;
        if ($updateRetailPrice && $supplierPrice > 0 && ! $isMainWarehouseReceipt) {
            $retailPrice = round($this->pricingService->calculateRetailPriceForWarehouse(
                $variant,
                (int) $receipt->warehouse_id,
                $supplierPrice,
            ), 2);
        }

        $variant->update([
            'is_preorder' => false,
            'is_active' => true,
        ]);

        $variant = ProductVariantLink::query()->lockForUpdate()->findOrFail($variant->id);
        $this->inventoryService->increaseVariantStock(
            $variant,
            $qty,
            'stock_receipt',
            $receipt->id,
            [
                'receipt_id' => $receipt->id,
                'receipt_item_id' => $storedItem->id,
                'supplier_price' => $supplierPrice,
                'retail_price' => $retailPrice,
                'supplier_sku' => $storedItem->supplier_sku,
                'warehouse_id' => $receipt->warehouse_id,
            ],
            (int) $receipt->warehouse_id
        );

        $this->stockLotService->createFromReceiptItem($receipt, $storedItem);

        if ($updateRetailPrice && $isMainWarehouseReceipt && $supplierPrice > 0) {
            $variantId = (int) $storedItem->variant_id;
            $warehouseId = (int) $receipt->warehouse_id;
            $avgMap = $this->stockLotService->avgPurchaseByVariant([$variantId], $warehouseId);
            $purchaseForRetail = $avgMap[$variantId] ?? number_format($supplierPrice, 2, '.', '');
            $retailPrice = round($this->pricingService->calculateRetailPriceForWarehouse(
                $variant,
                $warehouseId,
                (float) $purchaseForRetail,
            ), 2);
            $variant->update(['price' => $retailPrice]);
        }
    }

    private function resolveVariant(Product $product, array $item): ProductVariantLink
    {
        $variantId = (int) ($item['variant_id'] ?? 0);
        if ($variantId > 0) {
            $existingVariant = ProductVariantLink::query()
                ->where('product_id', $product->id)
                ->with('definition')
                ->find($variantId);

            if ($existingVariant) {
                return $existingVariant;
            }
        }

        $variantDefinitionId = (int) ($item['variant_definition_id'] ?? 0);
        if ($variantDefinitionId > 0) {
            $definition = VariantDefinition::query()->findOrFail($variantDefinitionId);

            return ProductVariantLink::query()->firstOrCreate(
                [
                    'product_id' => $product->id,
                    'variant_definition_id' => $definition->id,
                ],
                [
                    'price' => null,
                    'stock' => 0,
                    'reserved_stock' => 0,
                    'is_preorder' => false,
                    'is_active' => true,
                    'sort_order' => 0,
                ]
            )->load('definition');
        }

        $variantPayload = $item['variant_definition'] ?? null;
        if (!is_array($variantPayload)) {
            abort(422, 'Не выбран вариант товара');
        }

        $volumeMl = VariantDefinitionVolume::normalize($variantPayload['volume_ml'] ?? 0);
        $concentrationCode = mb_strtolower(trim((string) ($variantPayload['concentration_code'] ?? '')));
        $concentrationLabel = trim((string) ($variantPayload['concentration_label'] ?? ''));
        $isTester = (bool) ($variantPayload['is_tester'] ?? false);
        $isVial = (bool) ($variantPayload['is_vial'] ?? false);

        abort_if($volumeMl < 0.1 || $concentrationCode === '' || $concentrationLabel === '', 422, 'Некорректные параметры нового варианта');
        abort_if($isTester && $isVial, 422, 'Вариант не может быть одновременно тестером и пробником');

        $definition = VariantDefinition::query()->firstOrCreate(
            [
                'volume_ml' => $volumeMl,
                'concentration_code' => $concentrationCode,
                'is_tester' => $isTester,
                'is_vial' => $isVial,
            ],
            [
                'concentration_label' => $concentrationLabel,
                'title' => VariantDefinitionVolume::buildTitle($volumeMl, $concentrationCode, $concentrationLabel, $isTester, $isVial),
                'sort_order' => 0,
            ]
        );

        return ProductVariantLink::query()->firstOrCreate(
            [
                'product_id' => $product->id,
                'variant_definition_id' => $definition->id,
            ],
            [
                'price' => null,
                'stock' => 0,
                'reserved_stock' => 0,
                'is_preorder' => false,
                'is_active' => true,
                'sort_order' => 0,
            ]
        )->load('definition');
    }

    private function rollbackItems(StockReceipt $receipt): void
    {
        foreach ($receipt->items as $item) {
            $variant = ProductVariantLink::query()->lockForUpdate()->find($item->variant_id);
            if (!$variant) {
                continue;
            }

            $this->stockLotService->rollbackReceiptItem($item, (int) $receipt->warehouse_id);

            $this->inventoryService->decreaseVariantStock(
                $variant,
                (int) $item->qty,
                'stock_receipt_rollback',
                $receipt->id,
                [
                    'receipt_id' => $receipt->id,
                    'receipt_item_id' => $item->id,
                    'warehouse_id' => $receipt->warehouse_id,
                ],
                (int) $receipt->warehouse_id
            );

            $variant->refresh();
            $this->cleanupVariantIfUnused($variant);
        }
    }

    private function hardRollbackItems(StockReceipt $receipt): void
    {
        $warehouseId = (int) $receipt->warehouse_id;
        $detachedLotIds = [];

        foreach ($receipt->items as $item) {
            $variant = ProductVariantLink::query()->lockForUpdate()->find($item->variant_id);
            if (!$variant) {
                continue;
            }

            $detached = $this->stockLotService->forceDetachReceiptLot($item, $warehouseId);
            $qty = (int) ($detached['qty'] ?? 0);
            $reserved = (int) ($detached['reserved'] ?? 0);
            if (!empty($detached['lot_id'])) {
                $detachedLotIds[] = (int) $detached['lot_id'];
            }

            if ($reserved > 0) {
                $this->inventoryService->forceReleaseReservedQty(
                    $variant,
                    $reserved,
                    'stock_receipt_hard_purge',
                    (int) $receipt->id,
                    [
                        'receipt_id' => $receipt->id,
                        'receipt_item_id' => $item->id,
                        'warehouse_id' => $warehouseId,
                        'lot_id' => $detached['lot_id'] ?? null,
                        'hard' => true,
                    ],
                    $warehouseId
                );
            }

            if ($qty > 0) {
                $this->inventoryService->forceDecreaseVariantStock(
                    $variant,
                    $qty,
                    'stock_receipt_hard_purge',
                    (int) $receipt->id,
                    [
                        'receipt_id' => $receipt->id,
                        'receipt_item_id' => $item->id,
                        'warehouse_id' => $warehouseId,
                        'lot_id' => $detached['lot_id'] ?? null,
                        'hard' => true,
                    ],
                    $warehouseId
                );
            }

            $variant->refresh();
            $this->cleanupVariantIfUnused($variant);
        }

        $this->releaseReservationsFullyCoveredByLots($detachedLotIds, $warehouseId, (int) $receipt->id);
    }

    /**
     * @param  list<int>  $detachedLotIds
     */
    private function releaseReservationsFullyCoveredByLots(array $detachedLotIds, int $warehouseId, int $receiptId): void
    {
        if ($detachedLotIds === []) {
            return;
        }

        $detachedSet = array_fill_keys($detachedLotIds, true);

        $reservations = StockReservation::query()
            ->where('warehouse_id', $warehouseId)
            ->where('status', 'active')
            ->lockForUpdate()
            ->get();

        foreach ($reservations as $reservation) {
            $payload = is_array($reservation->payload) ? $reservation->payload : [];
            $lots = $payload['lots'] ?? null;
            if (!is_array($lots) || $lots === []) {
                continue;
            }

            $lotIds = [];
            foreach ($lots as $row) {
                $lotId = (int) ($row['lot_id'] ?? 0);
                if ($lotId > 0) {
                    $lotIds[] = $lotId;
                }
            }
            if ($lotIds === []) {
                continue;
            }

            $allDetached = true;
            foreach ($lotIds as $lotId) {
                if (!isset($detachedSet[$lotId])) {
                    $allDetached = false;
                    break;
                }
            }
            if (!$allDetached) {
                continue;
            }

            $reservation->update([
                'status' => 'released',
                'released_at' => now(),
                'payload' => array_merge($payload, [
                    'release_reason' => 'stock_receipt_hard_purge',
                    'purged_receipt_id' => $receiptId,
                ]),
            ]);
        }
    }

    private function cleanupVariantIfUnused(ProductVariantLink $variant): void
    {
        $variant->loadMissing('supplierOffers');

        $hasPositiveStock = (int) $variant->stock > 0;
        $hasReservedStock = (int) $variant->reserved_stock > 0;
        $hasSupplierOffers = $variant->supplierOffers()
            ->where('is_active', true)
            ->exists();

        if ($hasPositiveStock || $hasReservedStock || $hasSupplierOffers) {
            return;
        }

        $variant->delete();
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
}
