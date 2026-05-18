<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\DiscountCardTransaction;
use Modules\Loyalty\Models\UserDiscountCard;
use Modules\Users\Models\User;
use Modules\Loyalty\Services\GiftCertificateLedgerService;
use Modules\Checkout\Services\AdminOrderPricingService;
use Modules\Checkout\Services\SoldGiftCertificateFromOrderService;
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
            'discount_card_number' => ['nullable', 'string', 'max:64'],
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

    /**
     * Подсказки при создании заказа в админке: статистика по телефону, города доставки из прошлых заказов, карты лояльности.
     */
    public function customerContext(Request $request): JsonResponse
    {
        $digits = Phone::normalize((string) $request->query('phone', ''));
        if (strlen($digits) < 7) {
            return response()->json([
                'data' => [
                    'matched_user' => null,
                    'orders' => ['completed' => 0, 'cancelled' => 0, 'active' => 0],
                    'delivery_cities' => [],
                    'discount_cards' => [],
                    'completed_orders' => [],
                ],
            ]);
        }

        $suffix = strlen($digits) >= 9 ? substr($digits, -9) : $digits;

        $orderRows = Order::query()
            ->with(['items:id,order_id,product_name,variant_title,qty'])
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderByDesc('id')
            ->limit(800)
            ->get(['id', 'status', 'delivery_city', 'phone', 'created_at', 'items_qty', 'total'])
            ->filter(fn (Order $o) => Phone::normalize((string) $o->phone) === $digits);

        $completed = $orderRows->whereIn('status', ['done', 'completed'])->count();
        $cancelled = $orderRows->where('status', 'cancelled')->count();
        $active = $orderRows->whereNotIn('status', ['done', 'completed', 'cancelled'])->count();

        $deliveryCities = $orderRows
            ->pluck('delivery_city')
            ->map(fn ($c) => trim((string) ($c ?? '')))
            ->filter(fn ($c) => $c !== '')
            ->unique()
            ->values()
            ->all();

        $completedOrders = $orderRows
            ->whereIn('status', ['done', 'completed'])
            ->take(30)
            ->map(static fn (Order $order): array => [
                'id' => (int) $order->id,
                'created_at' => optional($order->created_at)?->toIso8601String(),
                'items_qty' => (int) ($order->items_qty ?? 0),
                'total' => (string) $order->total,
                'items' => $order->items->map(static function (OrderItem $item): array {
                    return [
                        'product_name' => (string) ($item->product_name ?? ''),
                        'variant_title' => (string) ($item->variant_title ?? ''),
                        'qty' => (int) ($item->qty ?? 0),
                    ];
                })->values()->all(),
            ])
            ->values()
            ->all();

        $user = User::query()
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->first(fn (User $u) => Phone::normalize((string) $u->phone) === $digits);

        $cards = [];
        if ($user) {
            $cards = $user->discountCards()
                ->where('discount_cards.status', DiscountCard::STATUS_ACTIVE)
                ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
                ->orderByDesc('discount_cards.discount_percent')
                ->get(['discount_cards.id', 'discount_cards.card_number', 'discount_cards.discount_percent'])
                ->map(static function ($c) {
                    return [
                        'number' => $c->card_number,
                        'discount_percent' => (string) DiscountCard::effectiveDiscountPercent((float) $c->discount_percent),
                    ];
                })
                ->values()
                ->all();
        }

        return response()->json([
            'data' => [
                'matched_user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                ] : null,
                'orders' => [
                    'completed' => $completed,
                    'cancelled' => $cancelled,
                    'active' => $active,
                ],
                'delivery_cities' => $deliveryCities,
                'discount_cards' => $cards,
                'completed_orders' => $completedOrders,
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $status = trim((string) $request->input('status', ''));
        $period = trim((string) $request->input('period', ''));
        $allowedPeriods = ['today', 'week', 'month', 'year'];
        if ($period !== '' && ! in_array($period, $allowedPeriods, true)) {
            $period = '';
        }

        $fromInput = trim((string) $request->input('from', ''));
        $toInput = trim((string) $request->input('to', ''));

        $fromBoundary = null;
        $toBoundary = null;
        if ($fromInput !== '') {
            try {
                $fromBoundary = Carbon::createFromFormat('Y-m-d', $fromInput)->startOfDay();
            } catch (\Throwable) {
                $fromBoundary = null;
            }
        }
        if ($toInput !== '') {
            try {
                $toBoundary = Carbon::createFromFormat('Y-m-d', $toInput)->endOfDay();
            } catch (\Throwable) {
                $toBoundary = null;
            }
        }

        $useCustomDateRange = $fromBoundary !== null || $toBoundary !== null;
        if ($useCustomDateRange && $fromBoundary !== null && $toBoundary !== null && $fromBoundary->gt($toBoundary)) {
            $tmp = $fromBoundary->copy();
            $fromBoundary = $toBoundary->copy()->startOfDay();
            $toBoundary = $tmp->endOfDay();
        }

        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 25;
        }

        $orders = Order::query()
            ->with([
                'items.variant.supplierOffers.supplier',
                'discountCard:id,card_number',
                'orderGiftCertificates.giftCertificate',
                'giftCertificatePurchases',
                'soldGiftCertificates.template',
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
            ->when($useCustomDateRange, function ($query) use ($fromBoundary, $toBoundary) {
                if ($fromBoundary !== null && $toBoundary !== null) {
                    $query->whereBetween('created_at', [$fromBoundary, $toBoundary]);
                } elseif ($fromBoundary !== null) {
                    $query->where('created_at', '>=', $fromBoundary);
                } elseif ($toBoundary !== null) {
                    $query->where('created_at', '<=', $toBoundary);
                }
            })
            ->when(! $useCustomDateRange && $period === 'today', function ($query) {
                $query->whereDate('created_at', now()->toDateString());
            })
            ->when(! $useCustomDateRange && $period === 'week', function ($query) {
                $query->where('created_at', '>=', now()->copy()->subDays(6)->startOfDay());
            })
            ->when(! $useCustomDateRange && $period === 'month', function ($query) {
                $query->whereBetween('created_at', [
                    now()->copy()->startOfMonth()->startOfDay(),
                    now()->copy()->endOfMonth()->endOfDay(),
                ]);
            })
            ->when(! $useCustomDateRange && $period === 'year', function ($query) {
                $query->whereBetween('created_at', [
                    now()->copy()->startOfYear()->startOfDay(),
                    now()->copy()->endOfYear()->endOfDay(),
                ]);
            })
            ->latest('id')
            ->paginate($perPage);

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
                'discountCard:id,card_number',
                'orderGiftCertificates.giftCertificate',
                'giftCertificatePurchases',
                'soldGiftCertificates.template',
            ])
            ->findOrFail($id);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
        ]);
    }

    public function quote(Request $request, AdminOrderPricingService $pricing): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['nullable', 'string', 'max:32'],
            'discount_card_number' => ['nullable', 'string', 'max:64'],
            'delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
        ]);

        $discountCardNumber = trim((string) ($validated['discount_card_number'] ?? ''));
        if ($discountCardNumber !== '' && ! $pricing->resolveDiscountCard($discountCardNumber)) {
            return response()->json([
                'message' => 'Скидочная карта не найдена или неактивна.',
            ], 422);
        }

        $paymentMethod = (string) ($validated['payment_method'] ?? 'cash');
        $quote = $pricing->quote($validated['items'], $paymentMethod, $discountCardNumber !== '' ? $discountCardNumber : null);
        $deliveryFee = round((float) ($validated['delivery_fee'] ?? 0), 2);

        return response()->json([
            'data' => [
                'subtotal' => number_format($quote['subtotal'], 2, '.', ''),
                'loyalty_discount_percent' => number_format($quote['loyalty_discount_percent'], 2, '.', ''),
                'loyalty_discount_amount' => number_format($quote['loyalty_discount_amount'], 2, '.', ''),
                'discount_card_number' => $quote['discount_card_number'],
                'delivery_fee' => number_format($deliveryFee, 2, '.', ''),
                'merchandise_total' => number_format($quote['merchandise_total'], 2, '.', ''),
                'total' => number_format($quote['merchandise_total'] + $deliveryFee, 2, '.', ''),
            ],
        ]);
    }

    public function store(Request $request, AdminOrderPricingService $pricing): JsonResponse
    {
        $validated = $request->validate($this->orderValidationRules());
        $discountCardNumber = trim((string) ($validated['discount_card_number'] ?? ''));
        if ($discountCardNumber !== '' && ! $pricing->resolveDiscountCard($discountCardNumber)) {
            return response()->json([
                'message' => 'Скидочная карта не найдена или неактивна.',
            ], 422);
        }

        /** @var Order $order */
        $order = DB::transaction(function () use ($validated, $discountCardNumber) {
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

            $this->syncOrderItemsAndTotals($order, $validated['items'], [
                'payment_method' => (string) ($validated['payment_method'] ?? 'cash'),
                'discount_card_number' => $discountCardNumber !== '' ? $discountCardNumber : null,
            ]);
            $this->applyStatusTransitionEffects($order, null, (string) $order->status);

            return $order;
        });

        $order->refresh()->load([
            'items',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
        ]);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order created',
        ], 201);
    }

    public function update(Request $request, int $id, AdminOrderPricingService $pricing): JsonResponse
    {
        $validated = $request->validate($this->orderValidationRules());
        $discountCardNumber = trim((string) ($validated['discount_card_number'] ?? ''));
        if ($discountCardNumber !== '' && ! $pricing->resolveDiscountCard($discountCardNumber)) {
            return response()->json([
                'message' => 'Скидочная карта не найдена или неактивна.',
            ], 422);
        }

        $order = Order::query()->with('items')->findOrFail($id);
        $previousStatus = (string) $order->status;
        $isTerminal = in_array($order->status, ['done', 'cancelled'], true);

        if ($isTerminal && ! $this->terminalOrderItemsPayloadMatchesExisting($order, $validated['items'])) {
            return response()->json([
                'message' => 'По заказам со статусом «Выполнен» или «Отменён» нельзя менять состав товаров, количества и цены строк.',
            ], 422);
        }

        DB::transaction(function () use ($order, $validated, $previousStatus, $isTerminal, $discountCardNumber) {
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

            if ($isTerminal) {
                $this->recalculateOrderTotalsFromExistingItems($order);
            } else {
                $this->syncOrderItemsAndTotals($order, $validated['items'], [
                    'payment_method' => (string) ($validated['payment_method'] ?? 'cash'),
                    'discount_card_number' => $discountCardNumber !== '' ? $discountCardNumber : null,
                ]);
            }
            $nextStatus = (string) $order->status;
            $this->applyStatusTransitionEffects($order, $previousStatus, $nextStatus);
        });

        $order->refresh()->load([
            'items',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
        ]);

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

        $order->refresh()->load([
            'items',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
        ]);

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
            'discountCard:id,card_number',
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

        $order->load([
            'items',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
        ]);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order status updated',
        ]);
    }

    /**
     * @param array<int, array<string, mixed>> $items
     */
    private function terminalOrderItemsPayloadMatchesExisting(Order $order, array $items): bool
    {
        if (count($items) !== $order->items->count()) {
            return false;
        }

        $normalize = static function (array $row): array {
            return [
                'product_id' => $row['product_id'] ?? null,
                'variant_id' => $row['variant_id'] ?? null,
                'qty' => (int) ($row['qty'] ?? 0),
                'price' => round((float) ($row['price'] ?? 0), 2),
                'product_name' => isset($row['product_name']) ? (string) $row['product_name'] : '',
                'variant_title' => isset($row['variant_title']) ? (string) $row['variant_title'] : '',
            ];
        };

        $fromDb = $order->items->map(function (OrderItem $i) use ($normalize) {
            return $normalize([
                'product_id' => $i->product_id,
                'variant_id' => $i->variant_id,
                'qty' => $i->qty,
                'price' => $i->price,
                'product_name' => $i->product_name,
                'variant_title' => $i->variant_title,
            ]);
        })->sortBy(fn ($row) => ($row['variant_id'] ?? 0).':'.($row['product_id'] ?? 0))->values()->all();

        $fromPayload = collect($items)->map(fn ($item) => $normalize($item))
            ->sortBy(fn ($row) => ($row['variant_id'] ?? 0).':'.($row['product_id'] ?? 0))->values()->all();

        return $fromDb === $fromPayload;
    }

    private function recalculateOrderTotalsFromExistingItems(Order $order): void
    {
        $order->refresh();
        $order->load('items');

        $itemsQty = 0;
        $subtotal = 0.0;

        foreach ($order->items as $item) {
            $qty = (int) $item->qty;
            $price = round((float) $item->price, 2);
            $itemsQty += $qty;
            $subtotal += round($qty * $price, 2);
        }

        $subtotal = round($subtotal, 2);
        $deliveryFee = round((float) ($order->delivery_fee ?? 0), 2);
        $discountAmount = round((float) ($order->discount_amount ?? 0), 2);

        $order->update([
            'items_qty' => $itemsQty,
            'subtotal' => $subtotal,
            'total' => round(max(0, $subtotal - $discountAmount) + $deliveryFee, 2),
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array{payment_method?: string, discount_card_number?: string|null}  $pricingContext
     */
    private function syncOrderItemsAndTotals(Order $order, array $items, array $pricingContext = []): void
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
        $paymentMethod = (string) ($pricingContext['payment_method'] ?? $order->payment_method ?? 'cash');
        $discountCardNumber = array_key_exists('discount_card_number', $pricingContext)
            ? $pricingContext['discount_card_number']
            : $order->discount_card_number;

        $pricing = app(AdminOrderPricingService::class)->quote(
            array_map(static fn (array $item): array => [
                'qty' => (int) $item['qty'],
                'price' => (float) $item['price'],
            ], $items),
            $paymentMethod,
            $discountCardNumber !== null && trim((string) $discountCardNumber) !== ''
                ? trim((string) $discountCardNumber)
                : null,
        );

        $order->update([
            'items_qty' => $itemsQty,
            'subtotal' => round($subtotal, 2),
            'discount_card_id' => $pricing['discount_card_id'],
            'discount_card_number' => $pricing['discount_card_number'],
            'discount_percent_snapshot' => $pricing['loyalty_discount_percent'],
            'discount_amount' => $pricing['loyalty_discount_amount'],
            'total' => round($pricing['merchandise_total'] + $deliveryFee, 2),
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
            app(SoldGiftCertificateFromOrderService::class)->voidSoldAwaitingCompletion($order);
        }

        // Фронт админки использует статус `done` («Выполнен»); `completed` оставляем для совместимости.
        if (
            in_array($nextStatus, ['done', 'completed'], true)
            && !in_array((string) ($previousStatus ?? ''), ['done', 'completed'], true)
        ) {
            $stockService->completeOrder($order);
            $this->applyLoyaltyCompletion($order, (string) ($previousStatus ?? ''));
            app(SoldGiftCertificateFromOrderService::class)->activateSoldOnOrderCompleted(
                $order,
                (string) ($previousStatus ?? '')
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function orderPayloadWithInventoryFlag(Order $order): array
    {
        return array_merge(
            (new OrderResource($order))->resolve(),
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
        if (in_array($previousStatus, ['done', 'completed'], true)) {
            return;
        }

        $card = null;
        if ($order->discount_card_id) {
            $card = DiscountCard::query()->find($order->discount_card_id);
        }
        if (!$card) {
            $number = trim((string) $order->discount_card_number);
            if ($number !== '') {
                $card = DiscountCard::query()
                    ->where('card_number', $number)
                    ->where('status', DiscountCard::STATUS_ACTIVE)
                    ->first();
            }
        }
        if (!$card) {
            return;
        }

        $subtotal = (float) $order->subtotal;
        $increment = $subtotal > 100 ? 1.0 : 0.5;
        $before = (float) $card->discount_percent;
        $after = DiscountCard::effectiveDiscountPercent($before + $increment);
        $appliedIncrement = round($after - $before, 2);

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
            'percent_increment' => $appliedIncrement,
        ]);
    }

}
