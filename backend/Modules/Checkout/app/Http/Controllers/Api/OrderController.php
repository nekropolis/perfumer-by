<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\DiscountCardTransaction;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Services\GiftCertificateLedgerService;
use Modules\Loyalty\Services\GiftCertificateIssueService;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Services\StockInventoryService;

class OrderController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    private function orderValidationRules(): array
    {
        return [
            'customer_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:32'],
            'comment' => ['nullable', 'string'],
            'status' => ['sometimes', 'required', 'string', 'max:50'],
            'delivery_method' => ['nullable', 'string', 'max:40'],
            'delivery_city' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['nullable', 'string'],
            'delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:32'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['nullable', 'integer', 'min:1'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
            'items.*.product_name' => ['required', 'string', 'max:255'],
            'items.*.product_slug' => ['nullable', 'string', 'max:255'],
            'items.*.brand_name' => ['nullable', 'string', 'max:255'],
            'items.*.variant_title' => ['required', 'string', 'max:255'],
            'items.*.sku' => ['nullable', 'string', 'max:255'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
        ];
    }

    public function stats(): JsonResponse
    {
        $newCount = Order::query()->where('status', 'new')->count();

        return response()->json([
            'data' => [
                'by_status' => [
                    'new' => $newCount,
                ],
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $status = trim((string) $request->input('status', ''));

        $orders = Order::query()
            ->with([
                'items.variant.supplierOffers.supplier',
                'orderGiftCertificates.giftCertificate',
                'giftCertificatePurchases',
            ])
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($subQuery) use ($search) {
                    if (is_numeric($search)) {
                        $subQuery->orWhere('id', (int) $search);
                    }

                    $subQuery
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%");
                });
            })
            ->when($status !== '', function ($query) use ($status) {
                $query->where('status', $status);
            })
            ->latest('id')
            ->paginate(20);

        return response()->json([
            'data' => OrderResource::collection($orders->getCollection()),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page' => $orders->lastPage(),
                'per_page' => $orders->perPage(),
                'total' => $orders->total(),
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $order = Order::query()
            ->with([
                'items.variant.supplierOffers.supplier',
                'orderGiftCertificates.giftCertificate',
                'giftCertificatePurchases',
            ])
            ->findOrFail($id);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->orderValidationRules());

        /** @var Order $order */
        $order = DB::transaction(function () use ($validated) {
            $order = Order::query()->create([
                'customer_name' => $validated['customer_name'] ?? null,
                'phone' => (string) $validated['phone'],
                'comment' => $validated['comment'] ?? null,
                'status' => (string) ($validated['status'] ?? 'new'),
                'delivery_method' => $validated['delivery_method'] ?? null,
                'delivery_city' => $validated['delivery_city'] ?? null,
                'delivery_address' => $validated['delivery_address'] ?? null,
                'delivery_fee' => $validated['delivery_fee'] ?? 0,
                'payment_method' => $validated['payment_method'] ?? null,
            ]);

            $this->syncOrderItemsAndTotals($order, $validated['items']);
            $this->applyStatusTransitionEffects($order, null, (string) $order->status);

            return $order;
        });

        $order->refresh()->load(['items', 'orderGiftCertificates.giftCertificate', 'giftCertificatePurchases']);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order created',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate($this->orderValidationRules());

        $order = Order::query()->with('items')->findOrFail($id);
        $previousStatus = (string) $order->status;

        DB::transaction(function () use ($order, $validated, $previousStatus) {
            $order->update([
                'customer_name' => $validated['customer_name'] ?? null,
                'phone' => (string) $validated['phone'],
                'comment' => $validated['comment'] ?? null,
                'delivery_method' => $validated['delivery_method'] ?? null,
                'delivery_city' => $validated['delivery_city'] ?? null,
                'delivery_address' => $validated['delivery_address'] ?? null,
                'delivery_fee' => $validated['delivery_fee'] ?? 0,
                'payment_method' => $validated['payment_method'] ?? null,
                'status' => (string) ($validated['status'] ?? $previousStatus),
            ]);

            $this->syncOrderItemsAndTotals($order, $validated['items']);
            $nextStatus = (string) $order->status;
            $this->applyStatusTransitionEffects($order, $previousStatus, $nextStatus);
        });

        $order->refresh()->load(['items', 'orderGiftCertificates.giftCertificate', 'giftCertificatePurchases']);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order updated',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $order = Order::query()->with('items')->findOrFail($id);
        $previousStatus = (string) $order->status;
        $nextStatus = 'cancelled';

        if ($previousStatus === $nextStatus) {
            return response()->json([
                'data' => $this->orderPayloadWithInventoryFlag($order),
                'message' => 'Order already cancelled',
            ]);
        }

        DB::transaction(function () use ($order, $previousStatus, $nextStatus) {
            $order->update(['status' => $nextStatus]);
            $this->applyStatusTransitionEffects($order, $previousStatus, $nextStatus);
        });

        $order->refresh()->load(['items', 'orderGiftCertificates.giftCertificate', 'giftCertificatePurchases']);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order cancelled',
        ]);
    }

    /**
     * Досоздание складского списания по заказу «Выполнен», если раньше не вызвался completeOrder (например, баг со статусом).
     */
    public function syncInventoryWriteoff(int $id): JsonResponse
    {
        $order = Order::query()->with('items')->findOrFail($id);

        if (!in_array($order->status, ['done', 'completed'], true)) {
            return response()->json([
                'message' => 'Списание можно создать только для заказа со статусом «Выполнен».',
            ], 422);
        }

        if (StockWriteoff::query()->where('type', 'order')->where('order_id', $order->id)->exists()) {
            return response()->json([
                'message' => 'По этому заказу уже есть складское списание.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($order) {
                app(StockInventoryService::class)->completeOrder($order);
            });
        } catch (\Illuminate\Validation\ValidationException $e) {
            $errors = $e->errors();
            $first = collect($errors)->flatten()->first();

            return response()->json([
                'message' => is_string($first) && $first !== '' ? $first : 'Не удалось создать списание.',
                'errors' => $errors,
            ], 422);
        }

        $order->refresh()->load([
            'items.variant.supplierOffers.supplier',
            'orderGiftCertificates.giftCertificate',
        ]);

        return response()->json([
            'message' => 'Списание по резервам создано.',
            'data' => $this->orderPayloadWithInventoryFlag($order),
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'max:50'],
        ]);

        $order = Order::query()->findOrFail($id);
        $previousStatus = (string) $order->status;

        DB::transaction(function () use ($order, $validated, $previousStatus) {
            $order->update([
                'status' => $validated['status'],
            ]);
            $nextStatus = (string) $validated['status'];
            $this->applyStatusTransitionEffects($order, $previousStatus, $nextStatus);
        });

        $order->load(['items', 'orderGiftCertificates.giftCertificate', 'giftCertificatePurchases']);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order status updated',
        ]);
    }

    /**
     * @param array<int, array<string, mixed>> $items
     */
    private function syncOrderItemsAndTotals(Order $order, array $items): void
    {
        OrderItem::query()->where('order_id', $order->id)->delete();

        $itemsQty = 0;
        $subtotal = 0.0;

        foreach ($items as $item) {
            $qty = (int) $item['qty'];
            $price = round((float) $item['price'], 2);
            $lineTotal = round($qty * $price, 2);

            $order->items()->create([
                'product_id' => $item['product_id'] ?? null,
                'variant_id' => $item['variant_id'] ?? null,
                'product_name' => (string) $item['product_name'],
                'product_slug' => $item['product_slug'] ?? null,
                'brand_name' => $item['brand_name'] ?? null,
                'variant_title' => (string) $item['variant_title'],
                'sku' => $item['sku'] ?? null,
                'qty' => $qty,
                'price' => $price,
                'total' => $lineTotal,
            ]);

            $itemsQty += $qty;
            $subtotal += $lineTotal;
        }

        $deliveryFee = round((float) ($order->delivery_fee ?? 0), 2);

        $order->update([
            'items_qty' => $itemsQty,
            'subtotal' => round($subtotal, 2),
            'total' => round($subtotal + $deliveryFee, 2),
        ]);
    }

    private function applyStatusTransitionEffects(Order $order, ?string $previousStatus, string $nextStatus): void
    {
        $order->loadMissing('items');
        $stockService = app(StockInventoryService::class);

        if (($previousStatus === null && $nextStatus === 'new') || ($previousStatus !== null && $previousStatus !== 'new' && $nextStatus === 'new')) {
            $stockService->reserveForOrder($order);
        }

        if ($nextStatus === 'cancelled') {
            $stockService->releaseForOrder($order);
            app(GiftCertificateLedgerService::class)->refundOrderCertificates($order);
        }

        // Фронт админки использует статус `done` («Выполнен»); `completed` оставляем для совместимости.
        if (
            in_array($nextStatus, ['done', 'completed'], true)
            && !in_array((string) ($previousStatus ?? ''), ['done', 'completed'], true)
        ) {
            $stockService->completeOrder($order);
            $this->applyLoyaltyCompletion($order, (string) ($previousStatus ?? ''));
            $this->issuePurchasedGiftCertificates($order, (string) ($previousStatus ?? ''));
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function orderPayloadWithInventoryFlag(Order $order): array
    {
        return array_merge(
            (new OrderResource($order))->toArray(request()),
            [
                'can_sync_inventory_writeoff' => $this->orderNeedsInventoryWriteoffSync($order),
            ],
        );
    }

    private function orderNeedsInventoryWriteoffSync(Order $order): bool
    {
        if (!in_array($order->status, ['done', 'completed'], true)) {
            return false;
        }

        return !StockWriteoff::query()
            ->where('type', 'order')
            ->where('order_id', $order->id)
            ->exists();
    }

    private function applyLoyaltyCompletion(Order $order, string $previousStatus): void
    {
        if (in_array($previousStatus, ['done', 'completed'], true) || !$order->discount_card_id) {
            return;
        }

        $card = DiscountCard::query()->find($order->discount_card_id);
        if (!$card) {
            return;
        }

        $subtotal = (float) $order->subtotal;
        $increment = $subtotal > 100 ? 1.0 : 0.5;
        $before = (float) $card->discount_percent;
        $after = min(100, round($before + $increment, 2));

        $card->update([
            'discount_percent' => $after,
            'spent_total' => round((float) $card->spent_total + $subtotal, 2),
            'last_order_completed_at' => now(),
        ]);

        DiscountCardTransaction::query()->create([
            'discount_card_id' => $card->id,
            'order_id' => $order->id,
            'type' => 'order_completed',
            'order_subtotal' => $subtotal,
            'discount_percent_before' => $before,
            'discount_percent_after' => $after,
            'percent_increment' => $increment,
        ]);
    }

    private function issuePurchasedGiftCertificates(Order $order, string $previousStatus): void
    {
        if (in_array($previousStatus, ['done', 'completed'], true)) {
            return;
        }

        $order->loadMissing('giftCertificatePurchases');
        foreach ($order->giftCertificatePurchases as $purchase) {
            $alreadyIssued = GiftCertificate::query()
                ->where('sold_order_id', $order->id)
                ->where('source', GiftCertificate::SOURCE_SOLD)
                ->where('template_id', $purchase->template_id)
                ->count();
            $toIssue = max(0, (int) $purchase->qty - (int) $alreadyIssued);

            for ($i = 0; $i < $toIssue; $i++) {
                app(GiftCertificateIssueService::class)->issue([
                    'template_id' => (int) $purchase->template_id,
                    'initial_amount' => (float) $purchase->amount,
                    'source' => 'sold',
                    'sold_order_id' => $order->id,
                    'issued_to_user_id' => $order->user_id,
                    'issued_phone' => $order->phone,
                    'comment' => 'Автоматически создан после оплаты заказа #'.$order->id,
                    'issued_at' => now()->toDateTimeString(),
                    'activated_at' => now()->toDateTimeString(),
                ]);
            }
        }
    }
}
