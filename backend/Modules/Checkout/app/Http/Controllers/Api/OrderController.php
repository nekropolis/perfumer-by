<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Models\OrderStatus;
use Modules\Checkout\Services\CheckoutDeliveryService;
use Modules\Checkout\Support\DeliveryCityResolver;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\DiscountCardTransaction;
use Modules\Loyalty\Models\ClientDiscountCard;
use Modules\Users\Models\Client;
use Modules\Loyalty\Services\GiftCertificateLedgerService;
use Modules\Checkout\Services\AdminOrderPricingService;
use Modules\Checkout\Services\SoldGiftCertificateFromOrderService;
use Modules\Checkout\Support\OrderAccountScope;
use Modules\Warehouse\Models\StockReservation;
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
            'manager_comment' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'required', 'string', 'max:50'],
            'delivery_method' => ['nullable', 'string', 'max:40'],
            'delivery_city' => ['nullable', 'string', 'max:255'],
            'delivery_city_id' => ['nullable', 'integer', 'min:1'],
            'delivery_address' => ['nullable', 'string'],
            'delivery_street_prefix' => ['nullable', 'string', 'max:32'],
            'delivery_house' => ['nullable', 'string', 'max:32'],
            'delivery_korpus' => ['nullable', 'string', 'max:32'],
            'delivery_apartment' => ['nullable', 'string', 'max:32'],
            'delivery_comment' => ['nullable', 'string', 'max:500'],
            'shipment_id' => ['nullable', 'string', 'max:64'],
            'shipment_date' => ['nullable', 'date_format:Y-m-d'],
            'delivery_date' => ['nullable', 'date_format:Y-m-d'],
            'delivery_time_from' => ['nullable', 'date_format:H:i'],
            'delivery_time_to' => ['nullable', 'date_format:H:i'],
            'delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:32'],
            'discount_card_number' => ['nullable', 'string', 'max:64'],
            'gift_certificate_code' => ['nullable', 'string', 'max:64'],
            'tag_ids' => ['nullable', 'array'],
            'tag_ids.*' => ['integer', 'distinct', 'exists:order_tags,id'],
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
            'items.*.availability_source' => [
                'nullable',
                'string',
                'in:main,main+supplier,supplier_only,supplier_warehouse,unavailable',
            ],
            'items.*.waiting_discount' => ['sometimes', 'boolean'],
            'items.*.stock_lot_allocations' => ['nullable', 'array'],
            'items.*.stock_lot_allocations.*.lot_id' => ['required_with:items.*.stock_lot_allocations', 'integer', 'min:1'],
            'items.*.stock_lot_allocations.*.qty' => ['required_with:items.*.stock_lot_allocations', 'integer', 'min:1'],
            'items.*.supplier_variant_offer_id' => ['nullable', 'integer', 'min:1', 'exists:supplier_variant_offers,id'],
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function normalizeDeliveryFields(array $validated): array
    {
        if (($validated['delivery_method'] ?? null) === CheckoutDeliveryService::METHOD_PICKUP) {
            $validated['shipment_id'] = null;
        } elseif (($validated['delivery_method'] ?? null) === CheckoutDeliveryService::METHOD_MINSK) {
            $shipmentId = trim((string) ($validated['shipment_id'] ?? ''));
            $validated['shipment_id'] = $shipmentId !== '' ? $shipmentId : null;
        } elseif (($validated['delivery_method'] ?? null) === CheckoutDeliveryService::METHOD_BELARUS) {
            $shipmentId = trim((string) ($validated['shipment_id'] ?? ''));
            $validated['shipment_id'] = $shipmentId !== '' ? $shipmentId : null;
        } else {
            $validated['shipment_id'] = null;
        }

        return DeliveryCityResolver::apply($validated);
    }

    public function stats(): JsonResponse
    {
        $newCount = Order::query()->where('status', 'new')->count();
        $today = now('Europe/Minsk')->toDateString();
        $overdueDeliveryCount = Order::query()
            ->whereNotNull('shipment_date')
            ->whereDate('shipment_date', '<', $today)
            ->whereNotIn('status', ['done', 'cancelled', 'completed'])
            ->count();

        return response()->json([
            'data' => [
                'by_status' => [
                    'new' => $newCount,
                ],
                'overdue_delivery' => $overdueDeliveryCount,
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
                    'customer_name' => null,
                    'orders' => ['completed' => 0, 'cancelled' => 0, 'active' => 0],
                    'delivery_cities' => [],
                    'discount_cards' => [],
                    'completed_orders' => [],
                    'active_orders' => [],
                    'cancelled_orders' => [],
                ],
            ]);
        }

        $suffix = strlen($digits) >= 9 ? substr($digits, -9) : $digits;

        $orderRows = Order::query()
            ->with(['items:id,order_id,product_name,variant_title,qty'])
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderByDesc('id')
            ->limit(800)
            ->get(['id', 'status', 'delivery_city', 'phone', 'created_at', 'items_qty', 'total', 'customer_name'])
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

        $completedOrders = $this->customerContextOrderRows(
            $orderRows->whereIn('status', ['done', 'completed'])
        );
        $activeOrders = $this->customerContextOrderRows(
            $orderRows->whereNotIn('status', ['done', 'completed', 'cancelled'])
        );
        $cancelledOrders = $this->customerContextOrderRows(
            $orderRows->where('status', 'cancelled')
        );

        $client = Client::query()
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->first(fn (Client $candidate) => Phone::normalize((string) $candidate->phone) === $digits);

        $suggestedCustomerName = null;
        if ($client && filled(trim((string) ($client->name ?? '')))) {
            $suggestedCustomerName = trim((string) $client->name);
        } else {
            $latestNamedOrder = $orderRows->first(
                fn (Order $order) => filled(trim((string) ($order->customer_name ?? '')))
            );
            if ($latestNamedOrder) {
                $suggestedCustomerName = trim((string) $latestNamedOrder->customer_name);
            }
        }

        $cards = [];
        if ($client) {
            $cards = $client->discountCards()
                ->where('discount_cards.status', DiscountCard::STATUS_ACTIVE)
                ->wherePivot('link_status', ClientDiscountCard::LINK_VERIFIED)
                ->orderByDesc('discount_cards.discount_percent')
                ->get([
                    'discount_cards.id',
                    'discount_cards.card_number',
                    'discount_cards.discount_percent',
                    'discount_cards.is_manual_discount',
                ])
                ->map(static function ($c) {
                    return [
                        'number' => $c->card_number,
                        'discount_percent' => (string) $c->resolvedDiscountPercent(),
                    ];
                })
                ->values()
                ->all();
        }

        return response()->json([
            'data' => [
                'matched_user' => $client ? [
                    'id' => $client->id,
                    'name' => $client->name,
                ] : null,
                'customer_name' => $suggestedCustomerName,
                'orders' => [
                    'completed' => $completed,
                    'cancelled' => $cancelled,
                    'active' => $active,
                ],
                'delivery_cities' => $deliveryCities,
                'discount_cards' => $cards,
                'completed_orders' => $completedOrders,
                'active_orders' => $activeOrders,
                'cancelled_orders' => $cancelledOrders,
            ],
        ]);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Order>  $orders
     * @return list<array<string, mixed>>
     */
    private function customerContextOrderRows(\Illuminate\Support\Collection $orders): array
    {
        return $orders
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

        // Один день: period=today или from=to — выполненные/отменённые в конец списка.
        $isSingleDayFilter = (! $useCustomDateRange && $period === 'today')
            || (
                $fromBoundary !== null
                && $toBoundary !== null
                && $fromBoundary->toDateString() === $toBoundary->toDateString()
            );

        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 25;
        }

        $hasActiveFilter = $search !== ''
            || $status !== ''
            || $period !== ''
            || $useCustomDateRange;

        $orders = Order::query()
            ->with([
                'items.variant.supplierOffers.supplier',
                'items.product.attributeValues.productAttribute',
                'items.product.attributeValues.selectedOptions.productAttributeOption',
                'discountCard:id,card_number',
                'orderGiftCertificates.giftCertificate',
                'giftCertificatePurchases',
                'soldGiftCertificates.template',
                'tags:id,name,color',
            ])
            ->when(! $hasActiveFilter, function ($query) {
                $query->whereNotIn('status', ['cancelled', 'done', 'completed']);
            })
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($subQuery) use ($search) {
                    if (is_numeric($search)) {
                        $subQuery->orWhere('id', (int) $search);
                    }

                    $subQuery
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%")
                        ->orWhere('shipment_id', 'like', "%{$search}%");
                });
            })
            ->when($status !== '', function ($query) use ($status) {
                $query->where('status', $status);
            })
            ->when($useCustomDateRange, function ($query) use ($fromBoundary, $toBoundary) {
                if ($fromBoundary !== null && $toBoundary !== null) {
                    $query->whereBetween('shipment_date', [
                        $fromBoundary->toDateString(),
                        $toBoundary->toDateString(),
                    ]);
                } elseif ($fromBoundary !== null) {
                    $query->whereDate('shipment_date', '>=', $fromBoundary->toDateString());
                } elseif ($toBoundary !== null) {
                    $query->whereDate('shipment_date', '<=', $toBoundary->toDateString());
                }
            })
            ->when(! $useCustomDateRange && $period === 'today', function ($query) {
                $query->whereDate('shipment_date', now()->toDateString());
            })
            ->when(! $useCustomDateRange && $period === 'week', function ($query) {
                $query->whereDate('shipment_date', '>=', now()->copy()->subDays(6)->toDateString());
            })
            ->when(! $useCustomDateRange && $period === 'month', function ($query) {
                $query->whereBetween('shipment_date', [
                    now()->copy()->startOfMonth()->toDateString(),
                    now()->copy()->endOfMonth()->toDateString(),
                ]);
            })
            ->when(! $useCustomDateRange && $period === 'year', function ($query) {
                $query->whereBetween('shipment_date', [
                    now()->copy()->startOfYear()->toDateString(),
                    now()->copy()->endOfYear()->toDateString(),
                ]);
            })
            ->when($isSingleDayFilter, function ($query) {
                $query->orderByRaw("CASE WHEN status IN ('done', 'cancelled', 'completed') THEN 1 ELSE 0 END");
            })
            ->orderByRaw(
                "CASE
                    WHEN shipment_date IS NOT NULL
                     AND shipment_date < ?
                     AND status NOT IN ('done', 'cancelled', 'completed')
                    THEN 0 ELSE 1
                END ASC,
                CASE
                    WHEN shipment_date IS NOT NULL
                     AND shipment_date < ?
                     AND status NOT IN ('done', 'cancelled', 'completed')
                    THEN shipment_date
                END ASC,
                CASE
                    WHEN NOT (
                        shipment_date IS NOT NULL
                        AND shipment_date < ?
                        AND status NOT IN ('done', 'cancelled', 'completed')
                    )
                    THEN shipment_date
                END DESC,
                shipment_date IS NULL ASC,
                id DESC",
                [
                    now('Europe/Minsk')->toDateString(),
                    now('Europe/Minsk')->toDateString(),
                    now('Europe/Minsk')->toDateString(),
                ]
            )
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
                'items.product.attributeValues.productAttribute',
                'items.product.attributeValues.selectedOptions.productAttributeOption',
                'discountCard:id,card_number',
                'orderGiftCertificates.giftCertificate',
                'giftCertificatePurchases',
                'soldGiftCertificates.template',
                'tags:id,name,color',
            ])
            ->findOrFail($id);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
        ]);
    }

    public function quote(Request $request, AdminOrderPricingService $pricing, CheckoutDeliveryService $delivery): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['nullable', 'string', 'max:32'],
            'delivery_method' => ['nullable', 'string', 'in:minsk_courier,belarus_courier,pickup'],
            'discount_card_number' => ['nullable', 'string', 'max:64'],
            'gift_certificate_code' => ['nullable', 'string', 'max:64'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $discountCardNumber = trim((string) ($validated['discount_card_number'] ?? ''));
        if ($discountCardNumber !== '' && ! $pricing->resolveDiscountCard($discountCardNumber)) {
            return response()->json([
                'message' => 'Скидочная карта не найдена или неактивна.',
            ], 422);
        }

        $forOrder = null;
        $orderId = (int) ($validated['order_id'] ?? 0);
        if ($orderId > 0) {
            $forOrder = Order::query()->find($orderId);
        }

        $giftCertificateCode = trim((string) ($validated['gift_certificate_code'] ?? ''));
        if ($giftCertificateCode !== '') {
            $giftError = $pricing->giftCertificateValidationError($giftCertificateCode, $forOrder);
            if ($giftError !== null) {
                return response()->json([
                    'message' => $giftError['message'],
                    'code' => $giftError['code'],
                ], 422);
            }
        }

        $paymentMethod = (string) ($validated['payment_method'] ?? 'cash');
        $quote = $pricing->quote(
            $validated['items'],
            $paymentMethod,
            $discountCardNumber !== '' ? $discountCardNumber : null,
            $giftCertificateCode !== '' ? $giftCertificateCode : null,
            $forOrder,
        );

        $deliveryMethod = (string) ($validated['delivery_method'] ?? '');
        if ($deliveryMethod !== '') {
            $lines = [];
            foreach ($validated['items'] as $item) {
                $variantId = (int) ($item['variant_id'] ?? 0);
                $lines[] = [
                    'variant_id' => $variantId > 0 ? $variantId : null,
                    'qty' => max(0, (int) ($item['qty'] ?? 0)),
                ];
            }
            $deliveryFee = round($delivery->deliveryFeeForOrderLines(
                $deliveryMethod,
                $quote['merchandise_total'],
                $lines,
            ), 2);
        } else {
            $deliveryFee = round((float) ($validated['delivery_fee'] ?? 0), 2);
        }

        return response()->json([
            'data' => [
                'subtotal' => number_format($quote['subtotal'], 2, '.', ''),
                'loyalty_discount_percent' => number_format($quote['loyalty_discount_percent'], 2, '.', ''),
                'loyalty_discount_amount' => number_format($quote['loyalty_discount_amount'], 2, '.', ''),
                'discount_card_number' => $quote['discount_card_number'],
                'gift_certificate_code' => $quote['gift_certificate_code'],
                'gift_certificate_amount' => number_format($quote['gift_certificate_amount'], 2, '.', ''),
                'delivery_fee' => number_format($deliveryFee, 2, '.', ''),
                'merchandise_total' => number_format($quote['merchandise_total'], 2, '.', ''),
                'total' => number_format($quote['total_before_delivery'] + $deliveryFee, 2, '.', ''),
            ],
        ]);
    }

    public function store(Request $request, AdminOrderPricingService $pricing): JsonResponse
    {
        $validated = $this->normalizeDeliveryFields($request->validate($this->orderValidationRules()));
        $this->assertAssignableOrderStatus((string) ($validated['status'] ?? 'new'));
        $discountCardNumber = trim((string) ($validated['discount_card_number'] ?? ''));
        if ($discountCardNumber !== '' && ! $pricing->resolveDiscountCard($discountCardNumber)) {
            return response()->json([
                'message' => 'Скидочная карта не найдена или неактивна.',
            ], 422);
        }

        $giftCertificateCode = trim((string) ($validated['gift_certificate_code'] ?? ''));
        if ($giftCertificateCode !== '') {
            $giftError = $pricing->giftCertificateValidationError($giftCertificateCode);
            if ($giftError !== null) {
                return response()->json([
                    'message' => $giftError['message'],
                    'code' => $giftError['code'],
                ], 422);
            }
        }

        /** @var Order $order */
        $order = DB::transaction(function () use ($validated, $discountCardNumber, $giftCertificateCode) {
            $phone = Phone::normalize((string) $validated['phone']);
            $order = Order::query()->create([
                'client_id' => OrderAccountScope::resolveClientIdForPhone($phone),
                'customer_name' => $validated['customer_name'] ?? null,
                'phone' => $phone,
                'comment' => $validated['comment'] ?? null,
                'manager_comment' => $validated['manager_comment'] ?? null,
                'status' => (string) ($validated['status'] ?? 'new'),
                'delivery_method' => $validated['delivery_method'] ?? null,
                'delivery_city' => $validated['delivery_city'] ?? null,
                'delivery_city_id' => $validated['delivery_city_id'] ?? null,
                'delivery_address' => $validated['delivery_address'] ?? null,
                'delivery_street_prefix' => $validated['delivery_street_prefix'] ?? null,
                'delivery_house' => $validated['delivery_house'] ?? null,
                'delivery_korpus' => $validated['delivery_korpus'] ?? null,
                'delivery_apartment' => $validated['delivery_apartment'] ?? null,
                'delivery_comment' => $validated['delivery_comment'] ?? null,
                'shipment_id' => $validated['shipment_id'] ?? null,
                'shipment_date' => $validated['shipment_date'] ?? now()->toDateString(),
                'delivery_date' => $validated['delivery_date'] ?? null,
                'delivery_time_from' => $validated['delivery_time_from'] ?? null,
                'delivery_time_to' => $validated['delivery_time_to'] ?? null,
                'delivery_fee' => $validated['delivery_fee'] ?? 0,
                'payment_method' => $validated['payment_method'] ?? null,
            ]);

            $this->syncOrderItemsAndTotals($order, $validated['items'], [
                'payment_method' => (string) ($validated['payment_method'] ?? 'cash'),
                'discount_card_number' => $discountCardNumber !== '' ? $discountCardNumber : null,
                'gift_certificate_code' => $giftCertificateCode !== '' ? $giftCertificateCode : null,
            ]);
            $order->tags()->sync(array_values(array_unique(array_map('intval', $validated['tag_ids'] ?? []))));
            $this->applyStatusTransitionEffects($order, null, (string) $order->status);

            return $order;
        });

        $order->refresh()->load([
            'items.product.attributeValues.productAttribute',
            'items.product.attributeValues.selectedOptions.productAttributeOption',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
            'tags:id,name,color',
        ]);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order created',
        ], 201);
    }

    public function update(Request $request, int $id, AdminOrderPricingService $pricing): JsonResponse
    {
        $validated = $this->normalizeDeliveryFields($request->validate($this->orderValidationRules()));
        $discountCardNumber = trim((string) ($validated['discount_card_number'] ?? ''));
        if ($discountCardNumber !== '' && ! $pricing->resolveDiscountCard($discountCardNumber)) {
            return response()->json([
                'message' => 'Скидочная карта не найдена или неактивна.',
            ], 422);
        }

        $order = Order::query()->with('items')->findOrFail($id);
        $previousStatus = (string) $order->status;
        $nextStatusCandidate = (string) ($validated['status'] ?? $previousStatus);
        $this->assertAssignableOrderStatus($nextStatusCandidate, $previousStatus);
        $this->assertCanLeaveCompletedStatus($previousStatus, $nextStatusCandidate);
        $isTerminal = in_array($order->status, ['done', 'completed'], true);

        $giftCertificateCode = trim((string) ($validated['gift_certificate_code'] ?? ''));
        if (! $isTerminal && $giftCertificateCode !== '') {
            $giftError = $pricing->giftCertificateValidationError($giftCertificateCode, $order);
            if ($giftError !== null) {
                return response()->json([
                    'message' => $giftError['message'],
                    'code' => $giftError['code'],
                ], 422);
            }
        }

        if ($isTerminal && ! $this->terminalOrderItemsPayloadMatchesExisting($order, $validated['items'])) {
            return response()->json([
                'message' => 'По заказам со статусом «Выполнен» нельзя менять состав товаров, количества и цены строк.',
            ], 422);
        }

        DB::transaction(function () use ($order, $validated, $previousStatus, $isTerminal, $discountCardNumber, $giftCertificateCode) {
            $phone = Phone::normalize((string) $validated['phone']);
            $nextStatus = (string) ($validated['status'] ?? $previousStatus);
            $order->update([
                'client_id' => OrderAccountScope::resolveClientIdForPhone($phone) ?? $order->client_id,
                'customer_name' => $validated['customer_name'] ?? null,
                'phone' => $phone,
                'comment' => $validated['comment'] ?? null,
                'manager_comment' => $validated['manager_comment'] ?? null,
                'delivery_method' => $validated['delivery_method'] ?? null,
                'delivery_city' => $validated['delivery_city'] ?? null,
                'delivery_city_id' => $validated['delivery_city_id'] ?? null,
                'delivery_address' => $validated['delivery_address'] ?? null,
                'delivery_street_prefix' => $validated['delivery_street_prefix'] ?? null,
                'delivery_house' => $validated['delivery_house'] ?? null,
                'delivery_korpus' => $validated['delivery_korpus'] ?? null,
                'delivery_apartment' => $validated['delivery_apartment'] ?? null,
                'delivery_comment' => $validated['delivery_comment'] ?? null,
                'shipment_id' => $validated['shipment_id'] ?? null,
                'shipment_date' => $validated['shipment_date'] ?? $order->shipment_date?->format('Y-m-d') ?? now()->toDateString(),
                'delivery_date' => array_key_exists('delivery_date', $validated)
                    ? $validated['delivery_date']
                    : $order->delivery_date?->format('Y-m-d'),
                'delivery_time_from' => $validated['delivery_time_from'] ?? null,
                'delivery_time_to' => $validated['delivery_time_to'] ?? null,
                'delivery_fee' => $validated['delivery_fee'] ?? 0,
                'payment_method' => $validated['payment_method'] ?? null,
                'status' => $nextStatus,
            ]);

            if ($isTerminal) {
                $this->recalculateOrderTotalsFromExistingItems($order);
            } else {
                $stockService = app(StockInventoryService::class);
                $stockService->releaseForOrder($order, 'order_update');
                $this->syncOrderItemsAndTotals($order, $validated['items'], [
                    'payment_method' => (string) ($validated['payment_method'] ?? 'cash'),
                    'discount_card_number' => $discountCardNumber !== '' ? $discountCardNumber : null,
                    'gift_certificate_code' => $giftCertificateCode !== '' ? $giftCertificateCode : null,
                ]);
                $order->unsetRelation('items');
                $order->load('items');

                // Склад → резерв; офер/ожидание → без резерва (reserveOrderItem сам решает по availability_source).
                if (
                    in_array($nextStatus, ['new', 'confirmed', 'processing', 'assembled', 'in_delivery', 'preorder', 'done', 'completed'], true)
                    && $nextStatus !== 'cancelled'
                ) {
                    $stockService->reserveForOrder($order);
                }
            }

            $this->applyStatusTransitionEffects($order, $previousStatus, (string) $order->status);
            $order->tags()->sync(array_values(array_unique(array_map('intval', $validated['tag_ids'] ?? []))));
        });

        $order->refresh()->load([
            'items.product.attributeValues.productAttribute',
            'items.product.attributeValues.selectedOptions.productAttributeOption',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
            'tags:id,name,color',
        ]);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order updated',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $order = Order::query()->with('items')->findOrFail($id);
        $status = (string) $order->status;

        if (in_array($status, ['done', 'completed'], true)) {
            return response()->json([
                'message' => 'Заказ в статусе «Выполнен» удалить нельзя.',
            ], 422);
        }

        DB::transaction(function () use ($order) {
            $stockService = app(StockInventoryService::class);
            $stockService->releaseForOrder($order, 'order_deleted');
            app(GiftCertificateLedgerService::class)->refundOrderCertificates($order);
            app(SoldGiftCertificateFromOrderService::class)->voidSoldAwaitingCompletion($order);

            // Резервы без FK на orders — удаляем явно после снятия.
            StockReservation::query()
                ->where('order_id', $order->id)
                ->delete();

            $order->items()->delete();
            $order->delete();
        });

        return response()->json([
            'message' => 'Order deleted',
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
            'items.product.attributeValues.productAttribute',
            'items.product.attributeValues.selectedOptions.productAttributeOption',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
        ]);

        return response()->json([
            'message' => 'Списание по резервам создано.',
            'data' => $this->orderPayloadWithInventoryFlag($order),
        ]);
    }

    public function updateAdminFields(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'delivery_time_from' => ['sometimes', 'nullable', 'date_format:H:i'],
            'delivery_time_to' => ['sometimes', 'nullable', 'date_format:H:i'],
            'shipment_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'delivery_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'manager_comment' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'tag_ids' => ['sometimes', 'nullable', 'array'],
            'tag_ids.*' => ['integer', 'distinct', 'exists:order_tags,id'],
        ]);

        if ($validated === []) {
            return response()->json([
                'message' => 'Нет полей для обновления.',
            ], 422);
        }

        $order = Order::query()->findOrFail($id);
        $payload = [];
        if (array_key_exists('delivery_time_from', $validated)) {
            $payload['delivery_time_from'] = $validated['delivery_time_from'];
        }
        if (array_key_exists('delivery_time_to', $validated)) {
            $payload['delivery_time_to'] = $validated['delivery_time_to'];
        }
        if (array_key_exists('shipment_date', $validated)) {
            $payload['shipment_date'] = $validated['shipment_date'];
        }
        if (array_key_exists('delivery_date', $validated)) {
            $payload['delivery_date'] = $validated['delivery_date'];
        }
        if (array_key_exists('manager_comment', $validated)) {
            $raw = $validated['manager_comment'];
            $payload['manager_comment'] = is_string($raw) && trim($raw) !== '' ? trim($raw) : null;
        }

        if ($payload !== []) {
            $order->update($payload);
        }

        if (array_key_exists('tag_ids', $validated)) {
            $order->tags()->sync(array_values(array_unique(array_map('intval', $validated['tag_ids'] ?? []))));
        }

        $order->refresh()->load([
            'items.product.attributeValues.productAttribute',
            'items.product.attributeValues.selectedOptions.productAttributeOption',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
            'tags:id,name,color',
        ]);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order admin fields updated',
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'max:50'],
        ]);

        $order = Order::query()->findOrFail($id);
        $previousStatus = (string) $order->status;
        $nextStatus = (string) $validated['status'];
        $this->assertAssignableOrderStatus($nextStatus, $previousStatus);
        $this->assertCanLeaveCompletedStatus($previousStatus, $nextStatus);

        DB::transaction(function () use ($order, $nextStatus, $previousStatus) {
            $order->update([
                'status' => $nextStatus,
            ]);
            $this->applyStatusTransitionEffects($order, $previousStatus, $nextStatus);
        });

        $order->load([
            'items.product.attributeValues.productAttribute',
            'items.product.attributeValues.selectedOptions.productAttributeOption',
            'discountCard:id,card_number',
            'orderGiftCertificates.giftCertificate',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
            'tags:id,name,color',
        ]);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order status updated',
        ]);
    }

    public function updateItemFulfillment(Request $request, int $id, int $itemId): JsonResponse
    {
        $validated = $request->validate([
            'channel' => ['required', 'string', 'in:main,offer'],
            'lot_id' => ['nullable', 'integer', 'min:1'],
            'supplier_variant_offer_id' => ['nullable', 'integer', 'min:1', 'exists:supplier_variant_offers,id'],
        ]);

        if (! \Illuminate\Support\Facades\Schema::hasColumn('order_items', 'supplier_variant_offer_id')) {
            return response()->json([
                'message' => 'Не применена миграция supplier_variant_offer_id. Выполните: php artisan migrate',
            ], 503);
        }

        $order = Order::query()->with('items')->findOrFail($id);
        if (in_array((string) $order->status, ['done', 'completed'], true)) {
            return response()->json([
                'message' => 'По заказам со статусом «Выполнен» нельзя менять источник закупки.',
            ], 422);
        }

        /** @var OrderItem|null $item */
        $item = $order->items->firstWhere('id', $itemId);
        if (! $item) {
            return response()->json([
                'message' => 'Позиция заказа не найдена.',
            ], 404);
        }

        $channel = (string) $validated['channel'];
        $lotId = isset($validated['lot_id']) ? (int) $validated['lot_id'] : 0;
        $offerId = isset($validated['supplier_variant_offer_id'])
            ? (int) $validated['supplier_variant_offer_id']
            : 0;

        if ($channel === 'main') {
            $payload = [
                'availability_source' => 'main',
                'waiting_discount' => false,
                'supplier_variant_offer_id' => null,
                'supplier_purchase_price' => null,
                'stock_lot_allocations' => $lotId > 0
                    ? [['lot_id' => $lotId, 'qty' => max(1, (int) $item->qty)]]
                    : null,
            ];
        } else {
            if ($offerId <= 0) {
                throw ValidationException::withMessages([
                    'supplier_variant_offer_id' => ['Укажите офер поставщика.'],
                ]);
            }

            $offer = \Modules\Catalog\Models\SupplierVariantOffer::query()->find($offerId);
            if (! $offer || (int) $offer->product_variant_id !== (int) ($item->variant_id ?? 0)) {
                throw ValidationException::withMessages([
                    'supplier_variant_offer_id' => ['Офер не относится к варианту этой позиции.'],
                ]);
            }

            $payload = [
                'availability_source' => 'supplier_only',
                'waiting_discount' => true,
                'supplier_variant_offer_id' => $offerId,
                'supplier_purchase_price' => CatalogVariantStockPresenter::resolveListingPurchasePrice($offer)
                    ?? $offer->purchase_price,
                'stock_lot_allocations' => null,
            ];
        }

        try {
            DB::transaction(function () use ($order, $item, $payload) {
                $item->update($payload);

                $stockService = app(StockInventoryService::class);
                $stockService->releaseForOrder($order, 'order_item_fulfillment');
                $order->unsetRelation('items');
                $order->load('items');
                $stockService->reserveForOrder($order);
            });
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Illuminate\Database\QueryException $e) {
            report($e);
            $sqlMessage = $e->getMessage();
            if (str_contains($sqlMessage, 'supplier_variant_offer_id')) {
                return response()->json([
                    'message' => 'Не применена миграция supplier_variant_offer_id. Выполните: php artisan migrate',
                ], 503);
            }
            if (str_contains($sqlMessage, 'stock_reservation_order_item_variant_warehouse_unique')) {
                return response()->json([
                    'message' => 'Не удалось пересобрать резерв склада по заказу. Обновите страницу и попробуйте ещё раз.',
                ], 500);
            }

            $brief = $sqlMessage;
            if (preg_match('/Integrity constraint violation:\s*\d+\s*([^(]+)/', $sqlMessage, $m)) {
                $brief = trim($m[1]);
            } elseif (preg_match('/Column not found:\s*\d+\s*([^(]+)/', $sqlMessage, $m)) {
                $brief = trim($m[1]);
            }

            return response()->json([
                'message' => 'Не удалось обновить источник закупки (ошибка БД): '.$brief,
            ], 500);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => $e->getMessage() !== ''
                    ? $e->getMessage()
                    : 'Не удалось обновить источник закупки.',
            ], 500);
        }

        $item->refresh();

        return response()->json([
            'data' => [
                'order_id' => (int) $order->id,
                'item_id' => (int) $item->id,
                'availability_source' => $item->availability_source,
                'waiting_discount' => (bool) $item->waiting_discount,
                'stock_lot_allocations' => is_array($item->stock_lot_allocations)
                    ? $item->stock_lot_allocations
                    : null,
                'supplier_variant_offer_id' => $item->supplier_variant_offer_id
                    ? (int) $item->supplier_variant_offer_id
                    : null,
                'supplier_purchase_price' => $item->supplier_purchase_price !== null
                    ? number_format((float) $item->supplier_purchase_price, 2, '.', '')
                    : null,
            ],
            'message' => 'Источник закупки обновлён',
        ]);
    }

    private function assertAssignableOrderStatus(string $status, ?string $allowCurrent = null): void
    {
        if (OrderStatus::isAssignableCode($status, $allowCurrent)) {
            return;
        }

        throw ValidationException::withMessages([
            'status' => ['Недопустимый или отключённый статус заказа'],
        ]);
    }

    private function assertCanLeaveCompletedStatus(string $previousStatus, string $nextStatus): void
    {
        if (! in_array($previousStatus, ['done', 'completed'], true)) {
            return;
        }
        if (in_array($nextStatus, ['done', 'completed'], true)) {
            return;
        }

        throw ValidationException::withMessages([
            'status' => ['Статус «Выполнен» нельзя изменить.'],
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
        $order->load(['items', 'orderGiftCertificates']);

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
        $giftAmount = $order->resolvedGiftCertificateAmountApplied();

        $order->update([
            'items_qty' => $itemsQty,
            'subtotal' => $subtotal,
            'total' => round(max(0, $subtotal - $discountAmount - $giftAmount) + $deliveryFee, 2),
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array{payment_method?: string, discount_card_number?: string|null, gift_certificate_code?: string|null}  $pricingContext
     */
    private function syncOrderItemsAndTotals(Order $order, array $items, array $pricingContext = []): void
    {
        OrderItem::query()->where('order_id', $order->id)->delete();

        $itemsQty = 0;
        $subtotal = 0.0;

        $offerIds = collect($items)
            ->map(static fn (array $row) => isset($row['supplier_variant_offer_id']) ? (int) $row['supplier_variant_offer_id'] : 0)
            ->filter(static fn (int $id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        $offersById = $offerIds === []
            ? collect()
            : \Modules\Catalog\Models\SupplierVariantOffer::query()
                ->whereIn('id', $offerIds)
                ->get()
                ->keyBy('id');

        foreach ($items as $item) {
            $qty = (int) $item['qty'];
            $price = round((float) $item['price'], 2);
            $lineTotal = round($qty * $price, 2);
            $offerId = isset($item['supplier_variant_offer_id']) && (int) $item['supplier_variant_offer_id'] > 0
                ? (int) $item['supplier_variant_offer_id']
                : null;
            $offer = $offerId ? $offersById->get($offerId) : null;
            $supplierPurchasePrice = null;
            if ($offer) {
                $resolved = \Modules\Catalog\Support\CatalogVariantStockPresenter::resolveListingPurchasePrice($offer);
                $supplierPurchasePrice = $resolved !== null
                    ? round($resolved, 2)
                    : ($offer->purchase_price !== null ? round((float) $offer->purchase_price, 2) : null);
            }

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
                'waiting_discount' => (bool) ($item['waiting_discount'] ?? false),
                'availability_source' => isset($item['availability_source']) && is_string($item['availability_source'])
                    ? $item['availability_source']
                    : null,
                'stock_lot_allocations' => $this->normalizeStockLotAllocations($item['stock_lot_allocations'] ?? null),
                'supplier_variant_offer_id' => $offerId,
                'supplier_purchase_price' => $supplierPurchasePrice,
            ]);

            $itemsQty += $qty;
            $subtotal += $lineTotal;
        }

        $paymentMethod = (string) ($pricingContext['payment_method'] ?? $order->payment_method ?? 'cash');
        $discountCardNumber = array_key_exists('discount_card_number', $pricingContext)
            ? $pricingContext['discount_card_number']
            : $order->discount_card_number;
        $giftCertificateCode = array_key_exists('gift_certificate_code', $pricingContext)
            ? $pricingContext['gift_certificate_code']
            : null;

        $pricingItems = array_map(static fn (array $item): array => [
            'qty' => (int) $item['qty'],
            'price' => (float) $item['price'],
            'variant_id' => isset($item['variant_id']) ? (int) $item['variant_id'] : null,
        ], $items);

        $pricing = app(AdminOrderPricingService::class)->quote(
            $pricingItems,
            $paymentMethod,
            $discountCardNumber !== null && trim((string) $discountCardNumber) !== ''
                ? trim((string) $discountCardNumber)
                : null,
            $giftCertificateCode !== null && trim((string) $giftCertificateCode) !== ''
                ? trim((string) $giftCertificateCode)
                : null,
            $order,
        );

        // Ручная стоимость доставки из payload (store/update уже записали её в order) — не пересчитывать.
        $deliveryFee = round((float) ($order->delivery_fee ?? 0), 2);

        $order->update([
            'items_qty' => $itemsQty,
            'subtotal' => round($subtotal, 2),
            'delivery_fee' => $deliveryFee,
            'discount_card_id' => $pricing['discount_card_id'],
            'discount_card_number' => $pricing['discount_card_number'],
            'discount_percent_snapshot' => $pricing['loyalty_discount_percent'],
            'discount_amount' => $pricing['loyalty_discount_amount'],
            'total' => round($pricing['total_before_delivery'] + $deliveryFee, 2),
        ]);

        app(GiftCertificateLedgerService::class)->syncAdminOrderGiftCertificate(
            $order,
            $pricing['gift_certificate'],
            (float) $pricing['gift_certificate_amount'],
        );
    }

    private function applyStatusTransitionEffects(Order $order, ?string $previousStatus, string $nextStatus): void
    {
        $order->loadMissing('items');
        $stockService = app(StockInventoryService::class);

        $leavingCancelled = $previousStatus === 'cancelled' && $nextStatus !== 'cancelled';
        $enteringNew = ($previousStatus === null && $nextStatus === 'new')
            || ($previousStatus !== null && $previousStatus !== 'new' && $nextStatus === 'new');

        // При возврате из отменённых и при входе в new — резерв.
        // Для done/completed резерв нужен до completeOrder (списания).
        if ($enteringNew || $leavingCancelled) {
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
        $before = (float) $card->discount_percent;
        $after = $before;
        $appliedIncrement = 0.0;

        // Ручная установка скидки отключает правило накопления процента.
        if (! $card->is_manual_discount) {
            $increment = $subtotal > 100 ? 1.0 : 0.5;
            $after = DiscountCard::effectiveDiscountPercent($before + $increment);
            $appliedIncrement = round($after - $before, 2);
        }

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

    /**
     * @param  mixed  $raw
     * @return list<array{lot_id: int, qty: int}>|null
     */
    private function normalizeStockLotAllocations(mixed $raw): ?array
    {
        if (! is_array($raw) || $raw === []) {
            return null;
        }

        $out = [];
        foreach ($raw as $row) {
            if (! is_array($row)) {
                continue;
            }
            $lotId = (int) ($row['lot_id'] ?? 0);
            $qty = (int) ($row['qty'] ?? 0);
            if ($lotId <= 0 || $qty <= 0) {
                continue;
            }
            $out[] = ['lot_id' => $lotId, 'qty' => $qty];
        }

        return $out !== [] ? $out : null;
    }

}
