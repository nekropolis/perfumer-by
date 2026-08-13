<?php

namespace Modules\Checkout\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Models\OrderStatus;
use Modules\Checkout\Models\SupplierOrder;
use Modules\Checkout\Models\SupplierOrderItem;

class SupplierOrderService
{
    public const CUSTOMER_STATUS_ORDERED = 'order';

    /** Заказ нельзя частично отдать поставщику — ждём появления всех позиций. */
    public const CUSTOMER_STATUS_WAITING_APPEARANCE = 'v_ozidanii_poiavleniia';

    /**
     * Collect offer-selected lines from «Товары для заказов» and append to draft supplier orders.
     *
     * В заявку попадают только заказы, где каждая позиция либо на складе, либо с выбранным офером.
     * Если часть позиций «висячая» (нет ни склада, ни офера) — заказ целиком пропускаем
     * и переводим в «Ожидает появления».
     *
     * @return array{
     *     added: int,
     *     skipped: int,
     *     skipped_order_item_ids: list<int>,
     *     updated_order_ids: list<int>,
     *     ignored_order_ids: list<int>,
     *     draft_order_ids: list<int>
     * }
     */
    public function draftFromReservations(): array
    {
        $orderProductStatuses = OrderStatus::codesForOrderProducts();
        if ($orderProductStatuses === []) {
            return [
                'added' => 0,
                'skipped' => 0,
                'skipped_order_item_ids' => [],
                'updated_order_ids' => [],
                'ignored_order_ids' => [],
                'draft_order_ids' => [],
            ];
        }

        $items = OrderItem::query()
            ->select(['order_items.*', 'orders.status as order_status'])
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', $orderProductStatuses)
            ->with(['product', 'variant'])
            ->orderByDesc('orders.id')
            ->orderBy('order_items.id')
            ->get();

        $variantIds = $items
            ->pluck('variant_id')
            ->filter(fn ($id) => $id !== null)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $offersByVariant = $variantIds->isEmpty()
            ? collect()
            : SupplierVariantOffer::query()
                ->with('supplier')
                ->whereIn('product_variant_id', $variantIds->all())
                ->where('is_active', true)
                ->orderBy('purchase_price')
                ->orderByDesc('last_seen_at')
                ->orderByDesc('id')
                ->get()
                ->groupBy('product_variant_id');

        $existingDraftOrderItemIds = SupplierOrderItem::query()
            ->whereNotNull('order_item_id')
            ->whereHas('supplierOrder', fn ($q) => $q->draft())
            ->pluck('order_item_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->all();
        $existingDraftSet = array_fill_keys($existingDraftOrderItemIds, true);

        $itemsByOrder = $items->groupBy(fn (OrderItem $item) => (int) $item->order_id);

        $candidates = [];
        $skippedOrderItemIds = [];
        $ignoredOrderIds = [];

        foreach ($itemsByOrder as $orderId => $orderItems) {
            $orderId = (int) $orderId;
            $supplierCandidates = [];
            $hasUnresolved = false;

            foreach ($orderItems as $item) {
                if ($this->itemIsWarehouseChannel($item)) {
                    continue;
                }

                $selected = $this->resolveSelectedOffer($item, $offersByVariant);
                if ($selected !== null) {
                    $orderItemId = (int) $item->id;
                    if (isset($existingDraftSet[$orderItemId])) {
                        $skippedOrderItemIds[] = $orderItemId;

                        continue;
                    }

                    $supplierCandidates[] = [
                        'item' => $item,
                        'offer' => $selected,
                    ];

                    continue;
                }

                // Ни склад, ни выбранный офер — заказ нельзя дробить.
                $hasUnresolved = true;
            }

            if ($hasUnresolved) {
                if ($supplierCandidates !== []) {
                    $ignoredOrderIds[] = $orderId;
                }

                continue;
            }

            foreach ($supplierCandidates as $row) {
                $candidates[] = $row;
            }
        }

        if ($candidates === [] && $ignoredOrderIds === []) {
            return [
                'added' => 0,
                'skipped' => count($skippedOrderItemIds),
                'skipped_order_item_ids' => $skippedOrderItemIds,
                'updated_order_ids' => [],
                'ignored_order_ids' => [],
                'draft_order_ids' => [],
            ];
        }

        return DB::transaction(function () use ($candidates, $skippedOrderItemIds, $ignoredOrderIds) {
            $draftOrdersBySupplier = [];
            $updatedOrderIds = [];
            $added = 0;

            foreach ($candidates as $row) {
                /** @var OrderItem $item */
                $item = $row['item'];
                /** @var SupplierVariantOffer $offer */
                $offer = $row['offer'];
                $supplierId = (int) $offer->supplier_id;
                if ($supplierId <= 0) {
                    continue;
                }

                if (! isset($draftOrdersBySupplier[$supplierId])) {
                    $draft = SupplierOrder::query()
                        ->draft()
                        ->where('supplier_id', $supplierId)
                        ->first();

                    if ($draft === null) {
                        $draft = SupplierOrder::query()->create([
                            'supplier_id' => $supplierId,
                            'status' => SupplierOrder::STATUS_DRAFT,
                            'number' => null,
                            'ordered_at' => null,
                            'items_qty' => 0,
                            'total' => 0,
                        ]);
                    }

                    $draftOrdersBySupplier[$supplierId] = $draft;
                }

                /** @var SupplierOrder $draftOrder */
                $draftOrder = $draftOrdersBySupplier[$supplierId];

                SupplierOrderItem::query()->create([
                    'supplier_order_id' => $draftOrder->id,
                    'order_id' => (int) $item->order_id,
                    'order_item_id' => (int) $item->id,
                    'product_id' => $item->product_id ? (int) $item->product_id : null,
                    'variant_id' => $item->variant_id ? (int) $item->variant_id : null,
                    'supplier_variant_offer_id' => (int) $offer->id,
                    'supplier_product_name' => $offer->external_product_name
                        ?: $offer->external_variant_name
                        ?: $item->product_name,
                    'supplier_code' => $offer->external_id ?: $offer->sku,
                    'retail_price' => $offer->price,
                    'purchase_price_at_order' => $item->supplier_purchase_price !== null
                        ? $item->supplier_purchase_price
                        : $offer->purchase_price,
                    'qty' => max(1, (int) $item->qty),
                ]);

                $updatedOrderIds[(int) $item->order_id] = true;
                $added++;
            }

            foreach ($draftOrdersBySupplier as $draftOrder) {
                $draftOrder->unsetRelation('items');
                $draftOrder->recalculateTotals();
            }

            $orderIds = array_keys($updatedOrderIds);
            if ($orderIds !== []) {
                Order::query()
                    ->whereIn('id', $orderIds)
                    ->update(['status' => self::CUSTOMER_STATUS_ORDERED]);
            }

            $ignoredUnique = array_values(array_unique(array_map('intval', $ignoredOrderIds)));
            // Не трогаем заказы, которые всё же попали в заявку.
            $ignoredUnique = array_values(array_diff($ignoredUnique, $orderIds));
            if ($ignoredUnique !== []) {
                Order::query()
                    ->whereIn('id', $ignoredUnique)
                    ->update(['status' => self::CUSTOMER_STATUS_WAITING_APPEARANCE]);
            }

            return [
                'added' => $added,
                'skipped' => count($skippedOrderItemIds),
                'skipped_order_item_ids' => $skippedOrderItemIds,
                'updated_order_ids' => $orderIds,
                'ignored_order_ids' => $ignoredUnique,
                'draft_order_ids' => collect($draftOrdersBySupplier)
                    ->pluck('id')
                    ->map(fn ($id) => (int) $id)
                    ->values()
                    ->all(),
            ];
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function draftItemsPayload(): array
    {
        $items = SupplierOrderItem::query()
            ->whereHas('supplierOrder', fn ($q) => $q->draft())
            ->with([
                'supplierOrder.supplier',
                'supplierVariantOffer',
            ])
            ->orderBy('supplier_order_id')
            ->orderBy('id')
            ->get();

        return $items->map(fn (SupplierOrderItem $item) => $this->mapDraftItem($item))->all();
    }

    public function updateItemQty(int $itemId, int $qty): SupplierOrderItem
    {
        $qty = max(1, $qty);

        return DB::transaction(function () use ($itemId, $qty) {
            /** @var SupplierOrderItem $item */
            $item = SupplierOrderItem::query()
                ->whereHas('supplierOrder', fn ($q) => $q->draft())
                ->findOrFail($itemId);

            $item->qty = $qty;
            $item->save();

            $order = $item->supplierOrder;
            $order->unsetRelation('items');
            $order->recalculateTotals();

            $item->load(['supplierOrder.supplier', 'supplierVariantOffer']);

            return $item;
        });
    }

    public function deleteDraftItem(int $itemId): void
    {
        DB::transaction(function () use ($itemId) {
            /** @var SupplierOrderItem $item */
            $item = SupplierOrderItem::query()
                ->whereHas('supplierOrder', fn ($q) => $q->draft())
                ->findOrFail($itemId);

            $order = $item->supplierOrder;
            $item->delete();

            $order->unsetRelation('items');
            $remaining = $order->items()->count();
            if ($remaining === 0) {
                $order->delete();
            } else {
                $order->recalculateTotals();
            }
        });
    }

    public function addDraftItemFromSupplierProduct(int $supplierProductId, int $qty = 1): SupplierOrderItem
    {
        $qty = max(1, $qty);

        return DB::transaction(function () use ($supplierProductId, $qty) {
            $supplierProduct = \Modules\Catalog\Models\SupplierProduct::query()
                ->with('supplier')
                ->findOrFail($supplierProductId);

            $supplierId = (int) $supplierProduct->supplier_id;
            if ($supplierId <= 0) {
                throw ValidationException::withMessages([
                    'supplier_product_id' => ['У товара поставщика не указан поставщик.'],
                ]);
            }

            $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
            $code = trim((string) ($payload['external_code'] ?? ''));
            if ($code === '') {
                $code = trim(str_replace('supplier-xls://', '', (string) $supplierProduct->external_url));
            }

            $variantId = (int) ($payload['linked_variant_id'] ?? 0);
            $productId = $supplierProduct->product_id ? (int) $supplierProduct->product_id : null;

            $offer = null;
            if ($code !== '') {
                $offerQuery = SupplierVariantOffer::query()
                    ->where('supplier_id', $supplierId)
                    ->where(function ($q) use ($code) {
                        $q->where('external_id', $code)->orWhere('sku', $code);
                    });

                if ($variantId > 0) {
                    $offer = (clone $offerQuery)->where('product_variant_id', $variantId)->first()
                        ?? $offerQuery->orderByDesc('is_active')->orderByDesc('id')->first();
                } else {
                    $offer = $offerQuery->orderByDesc('is_active')->orderByDesc('id')->first();
                }
            }

            if ($offer && $variantId <= 0) {
                $variantId = (int) $offer->product_variant_id;
            }
            if ($productId === null && $variantId > 0) {
                $productId = (int) (\Modules\Catalog\Models\ProductVariantLink::query()
                    ->where('id', $variantId)
                    ->value('product_id') ?? 0) ?: null;
            }

            $purchasePrice = null;
            if ($offer) {
                $resolved = \Modules\Catalog\Support\CatalogVariantStockPresenter::resolveListingPurchasePrice($offer);
                $purchasePrice = $resolved !== null
                    ? round($resolved, 2)
                    : ($offer->purchase_price !== null ? round((float) $offer->purchase_price, 2) : null);
            }
            if ($purchasePrice === null && isset($payload['supplier_price']) && is_numeric($payload['supplier_price'])) {
                $purchasePrice = round((float) $payload['supplier_price'], 2);
            }

            $draft = SupplierOrder::query()
                ->draft()
                ->where('supplier_id', $supplierId)
                ->first();

            if ($draft === null) {
                $draft = SupplierOrder::query()->create([
                    'supplier_id' => $supplierId,
                    'status' => SupplierOrder::STATUS_DRAFT,
                    'number' => null,
                    'ordered_at' => null,
                    'items_qty' => 0,
                    'total' => 0,
                ]);
            }

            $item = SupplierOrderItem::query()->create([
                'supplier_order_id' => $draft->id,
                'order_id' => null,
                'order_item_id' => null,
                'product_id' => $productId,
                'variant_id' => $variantId > 0 ? $variantId : null,
                'supplier_variant_offer_id' => $offer?->id,
                'supplier_product_name' => $offer?->external_product_name
                    ?: $offer?->external_variant_name
                    ?: $supplierProduct->external_name,
                'supplier_code' => $code !== '' ? $code : ($offer?->external_id ?: $offer?->sku),
                'retail_price' => $offer?->price,
                'purchase_price_at_order' => $purchasePrice,
                'qty' => $qty,
            ]);

            $draft->unsetRelation('items');
            $draft->recalculateTotals();

            $item->load(['supplierOrder.supplier', 'supplierVariantOffer']);

            return $item;
        });
    }

    /**
     * @return list<SupplierOrder>
     */
    public function confirmDrafts(): array
    {
        return DB::transaction(function () {
            $drafts = SupplierOrder::query()
                ->draft()
                ->with('items')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            if ($drafts->isEmpty()) {
                return [];
            }

            $confirmed = [];
            $now = now();

            foreach ($drafts as $draft) {
                $draft->loadMissing('supplier');
                $draft->recalculateTotals();
                $draft->forceFill([
                    'status' => SupplierOrder::STATUS_CONFIRMED,
                    'number' => $this->makeSupplierOrderNumber($draft),
                    'ordered_at' => $now,
                ])->save();
                $draft->load(['supplier', 'items']);
                $confirmed[] = $draft;
            }

            return $confirmed;
        });
    }

    public function makeSupplierOrderNumber(SupplierOrder $order): string
    {
        $name = trim((string) ($order->supplier?->name ?? ''));
        if ($name === '') {
            $name = trim((string) ($order->supplier?->code ?? ''));
        }
        if ($name === '') {
            $name = 'SP';
        }

        $safe = preg_replace('/\s+/u', '', $name) ?: 'SP';

        return $safe.'-'.$order->id;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, \Illuminate\Support\Collection<int, SupplierVariantOffer>>  $offersByVariant
     */
    private function resolveSelectedOffer(
        OrderItem $item,
        $offersByVariant,
    ): ?SupplierVariantOffer {
        if ($this->itemIsWarehouseChannel($item)) {
            return null;
        }

        if (! $this->itemIsSupplierChannel($item)) {
            return null;
        }

        $offers = $offersByVariant->get((int) $item->variant_id, collect());
        if ($offers->isEmpty()) {
            return null;
        }

        $selectedOfferId = (int) ($item->supplier_variant_offer_id ?? 0);
        if ($selectedOfferId > 0) {
            $offer = $offers->first(fn (SupplierVariantOffer $o) => (int) $o->id === $selectedOfferId);

            return $offer instanceof SupplierVariantOffer ? $offer : null;
        }

        // Без явно выбранного офера позицию не считаем «есть у поставщика».
        return null;
    }

    private function itemIsWarehouseChannel(OrderItem $item): bool
    {
        $availabilitySource = (string) ($item->availability_source ?? 'unavailable');
        $waitingDiscount = (bool) ($item->waiting_discount ?? false);

        return in_array($availabilitySource, ['main', 'main+supplier'], true) && ! $waitingDiscount;
    }

    private function itemIsSupplierChannel(OrderItem $item): bool
    {
        $availabilitySource = (string) ($item->availability_source ?? 'unavailable');
        $waitingDiscount = (bool) ($item->waiting_discount ?? false);

        return in_array($availabilitySource, ['supplier_only', 'supplier_warehouse'], true)
            || ($availabilitySource === 'main+supplier' && $waitingDiscount);
    }

    /**
     * @return array<string, mixed>
     */
    public function mapDraftItem(SupplierOrderItem $item): array
    {
        $offer = $item->supplierVariantOffer;
        $offerMissing = $offer === null || ! (bool) $offer->is_active;
        $currentPurchaseRaw = $offer !== null
            ? \Modules\Catalog\Support\CatalogVariantStockPresenter::resolveListingPurchasePrice($offer)
            : null;
        $currentPurchase = $currentPurchaseRaw !== null
            ? number_format($currentPurchaseRaw, 2, '.', '')
            : ($offer !== null && $offer->purchase_price !== null
                ? number_format((float) $offer->purchase_price, 2, '.', '')
                : null);

        $supplier = $item->supplierOrder?->supplier;

        return [
            'id' => (int) $item->id,
            'supplier_order_id' => (int) $item->supplier_order_id,
            'order_id' => $item->order_id ? (int) $item->order_id : null,
            'order_item_id' => $item->order_item_id ? (int) $item->order_item_id : null,
            'supplier_id' => $supplier ? (int) $supplier->id : (int) ($item->supplierOrder?->supplier_id ?? 0),
            'supplier_name' => $supplier?->name,
            'supplier_code' => $item->supplier_code,
            'supplier_product_name' => $item->supplier_product_name,
            'retail_price' => $item->retail_price !== null
                ? number_format((float) $item->retail_price, 2, '.', '')
                : null,
            'purchase_price_at_order' => $item->purchase_price_at_order !== null
                ? number_format((float) $item->purchase_price_at_order, 2, '.', '')
                : null,
            'current_purchase_price' => $currentPurchase,
            'offer_missing' => $offerMissing,
            'qty' => (int) $item->qty,
            'supplier_variant_offer_id' => $item->supplier_variant_offer_id
                ? (int) $item->supplier_variant_offer_id
                : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function mapSupplierOrder(SupplierOrder $order, bool $withItems = false): array
    {
        $number = $order->number;
        if (is_string($number) && preg_match('/^SP-\d+$/', $number) === 1) {
            $number = $this->makeSupplierOrderNumber($order);
        }

        $payload = [
            'id' => (int) $order->id,
            'number' => $number,
            'status' => $order->status,
            'supplier_id' => (int) $order->supplier_id,
            'supplier_name' => $order->supplier?->name,
            'ordered_at' => $order->ordered_at?->toIso8601String(),
            'items_qty' => (int) $order->items_qty,
            'total' => number_format((float) $order->total, 2, '.', ''),
            'created_at' => $order->created_at?->toIso8601String(),
        ];

        if ($withItems) {
            $payload['items'] = $order->items->map(function (SupplierOrderItem $item) {
                return [
                    'id' => (int) $item->id,
                    'order_id' => $item->order_id ? (int) $item->order_id : null,
                    'order_item_id' => $item->order_item_id ? (int) $item->order_item_id : null,
                    'supplier_code' => $item->supplier_code,
                    'supplier_product_name' => $item->supplier_product_name,
                    'retail_price' => $item->retail_price !== null
                        ? number_format((float) $item->retail_price, 2, '.', '')
                        : null,
                    'purchase_price_at_order' => $item->purchase_price_at_order !== null
                        ? number_format((float) $item->purchase_price_at_order, 2, '.', '')
                        : null,
                    'qty' => (int) $item->qty,
                ];
            })->values()->all();
        }

        return $payload;
    }
}
