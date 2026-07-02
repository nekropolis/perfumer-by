<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Cart\Models\Cart;
use Modules\Cart\Models\CartItem;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Services\CheckoutDeliveryService;
use Modules\Checkout\Services\CheckoutQuoteService;
use Modules\Checkout\Services\SoldGiftCertificateFromOrderService;
use Modules\Communications\Services\Notifications\CheckoutTelegramNotificationService;
use Modules\Catalog\Support\WaitingDiscountPricing;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Services\GiftCertificateLedgerService;
use Modules\Loyalty\Services\LoyaltyPricingService;
use Modules\Users\Models\User as CustomerUser;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Modules\Warehouse\Services\StockInventoryService;
use Throwable;

class CheckoutController extends Controller
{
    public function checkout(Request $request, CheckoutQuoteService $quoteService): JsonResponse
    {
        $validated = $request->validate([
            'customer_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:64'],
            'phone_plain_digits' => ['sometimes', 'boolean'],
            'comment' => ['nullable', 'string'],
            'delivery_method' => ['required', Rule::in([
                CheckoutDeliveryService::METHOD_MINSK,
                CheckoutDeliveryService::METHOD_BELARUS,
                CheckoutDeliveryService::METHOD_PICKUP,
            ])],
            'delivery_city' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['required', 'string', 'max:2000'],
            'payment_method' => ['required', Rule::in(['cash', 'card'])],
            'cart_item_ids' => ['sometimes', 'array'],
            'cart_item_ids.*' => ['integer', 'min:1'],
            'gift_certificate_cart_item_ids' => ['sometimes', 'array'],
            'gift_certificate_cart_item_ids.*' => ['integer', 'min:1'],
        ]);

        Phone::assertValidFlexible(
            $validated['phone'],
            (bool) ($validated['phone_plain_digits'] ?? false),
        );

        $validated['customer_name'] = filled(trim((string) ($validated['customer_name'] ?? '')))
            ? trim((string) $validated['customer_name'])
            : null;

        $phone = $this->normalizePhone($validated['phone']);
        $user = $request->user() ?? Auth::guard('sanctum')->user();
        $orderUserId = $this->resolveOrderUserId($user, $phone);

        $cartItemAvailabilitySource = function (CartItem $cartItem): string {
            if ($cartItem->availability_source) {
                return $cartItem->availability_source;
            }

            $variant = $cartItem->variant;
            if (!$variant) {
                return 'unavailable';
            }

            $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
            $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');
            $rows = WarehouseVariantStock::query()
                ->where('variant_id', $variant->id)
                ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
                ->get()
                ->keyBy('warehouse_id');
            $mainStock = $mainWarehouseId > 0 ? $rows->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $rows->get($supplierWarehouseId) : null;

            $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

            return $presented['availability_source'];
        };

        $cartToken = $request->header('X-Cart-Token') ?: $request->input('cart_token');

        abort_if(!$cartToken, 422, 'Cart token is required');

        $cart = Cart::query()
            ->where('token', $cartToken)
            ->with([
                'items.product.brand',
                'items.variant',
                'giftCertificateItems.template',
            ])
            ->first();

        abort_if(!$cart, 422, 'Cart not found');
        abort_if($cart->items->isEmpty() && $cart->giftCertificateItems->isEmpty(), 422, 'Cart is empty');

        $partialCheckout = $request->has('cart_item_ids') || $request->has('gift_certificate_cart_item_ids');
        $checkoutProductLineIds = $partialCheckout
            ? array_values(array_map('intval', $validated['cart_item_ids'] ?? []))
            : [];
        $checkoutGiftLineIds = $partialCheckout
            ? array_values(array_map('intval', $validated['gift_certificate_cart_item_ids'] ?? []))
            : [];

        if ($partialCheckout) {
            abort_if($checkoutProductLineIds === [] && $checkoutGiftLineIds === [], 422, 'Выберите хотя бы одну позицию для оформления');
            $allowedProduct = $cart->items->pluck('id')->map(fn ($id) => (int) $id)->all();
            foreach ($checkoutProductLineIds as $id) {
                abort_if(!in_array($id, $allowedProduct, true), 422, 'Некорректная позиция корзины');
            }
            $allowedGift = $cart->giftCertificateItems->pluck('id')->map(fn ($id) => (int) $id)->all();
            foreach ($checkoutGiftLineIds as $id) {
                abort_if(!in_array($id, $allowedGift, true), 422, 'Некорректная позиция подарочного сертификата');
            }
        }

        if (
            $validated['payment_method'] === 'card'
            && !in_array($validated['delivery_method'], [CheckoutDeliveryService::METHOD_MINSK, CheckoutDeliveryService::METHOD_PICKUP], true)
        ) {
            abort(422, 'Оплата картой доступна только при доставке курьером по Минску или самовывозе');
        }

        if ($validated['delivery_method'] === CheckoutDeliveryService::METHOD_PICKUP) {
            $validated['delivery_address'] = 'нет - самовывоз';
            $validated['delivery_city'] = null;
        } elseif ($validated['delivery_method'] === CheckoutDeliveryService::METHOD_MINSK) {
            $validated['delivery_city'] = CheckoutDeliveryService::MINSK_CITY;
        }

        foreach ($cart->items as $cartItem) {
            if ($partialCheckout && !in_array((int) $cartItem->id, $checkoutProductLineIds, true)) {
                continue;
            }
            $variant = $cartItem->variant;
            abort_if(!$variant || !$variant->is_active, 422, 'One of the cart items is unavailable');
        }

        $quote = $quoteService->quote(
            $cart,
            $user,
            $validated['payment_method'],
            $validated['delivery_method'],
            $partialCheckout ? $checkoutProductLineIds : null,
            $partialCheckout ? $checkoutGiftLineIds : null,
        );

        $order = DB::transaction(function () use (
            $cart,
            $cartToken,
            $orderUserId,
            $validated,
            $phone,
            $quote,
            $partialCheckout,
            $checkoutProductLineIds,
            $checkoutGiftLineIds,
            $user,
            $cartItemAvailabilitySource,
        ) {
            $subtotal = 0;
            $itemsQty = 0;

            $order = Order::query()->create([
                'user_id' => $orderUserId,
                'cart_token' => $cartToken,
                'customer_name' => $validated['customer_name'] ?? null,
                'phone' => $phone,
                'comment' => $validated['comment'] ?? null,
                'status' => 'new',
                'items_qty' => 0,
                'subtotal' => 0,
                'total' => 0,
                'delivery_method' => $validated['delivery_method'],
                'delivery_city' => $validated['delivery_city'] ?? null,
                'delivery_address' => $validated['delivery_address'],
                'delivery_fee' => 0,
                'payment_method' => $validated['payment_method'],
                'discount_card_id' => $quote['discount_card_id'],
                'discount_card_number' => $quote['discount_card_number'],
                'discount_percent_snapshot' => $quote['loyalty_discount_percent'],
                'discount_amount' => $quote['loyalty_discount_amount'],
            ]);

            foreach ($cart->items as $cartItem) {
                if ($partialCheckout && !in_array((int) $cartItem->id, $checkoutProductLineIds, true)) {
                    continue;
                }
                $basePrice = (float) ($cartItem->variant?->price ?? 0);
                $waitingDiscount = (bool) $cartItem->waiting_discount && !(bool) ($cartItem->variant?->is_promotion ?? false);
                $price = $waitingDiscount && $basePrice > 0
                    ? WaitingDiscountPricing::apply($basePrice)
                    : $basePrice;
                $lineTotal = round($price * $cartItem->qty, 2);

                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $cartItem->product_id,
                    'variant_id' => $cartItem->variant_id,
                    'product_name' => $cartItem->product
                        ? \Modules\Catalog\Support\ProductDisplayName::forProduct($cartItem->product)
                        : '',
                    'product_slug' => $cartItem->product?->slug,
                    'brand_name' => $cartItem->product?->brand?->name,
                    'variant_title' => $this->makeVariantDisplayTitle($cartItem->variant),
                    'sku' => null,
                    'qty' => $cartItem->qty,
                    'price' => $price,
                    'total' => $lineTotal,
                    'waiting_discount' => $waitingDiscount,
                    'availability_source' => $cartItemAvailabilitySource($cartItem),
                ]);

                $subtotal += $lineTotal;
                $itemsQty += $cartItem->qty;
            }

            foreach ($cart->giftCertificateItems as $giftCartItem) {
                if ($partialCheckout && !in_array((int) $giftCartItem->id, $checkoutGiftLineIds, true)) {
                    continue;
                }
                $amount = (float) ($giftCartItem->template?->amount ?? 0);
                $qty = (int) $giftCartItem->qty;
                if ($amount <= 0 || $qty <= 0) {
                    continue;
                }

                $lineTotal = round($amount * $qty, 2);
                $order->giftCertificatePurchases()->create([
                    'template_id' => $giftCartItem->template_id,
                    'template_title' => (string) ($giftCartItem->template?->title ?? 'Подарочный сертификат'),
                    'amount' => round($amount, 2),
                    'qty' => $qty,
                    'total' => $lineTotal,
                    'created_at' => now(),
                ]);

                $subtotal += $lineTotal;
                $itemsQty += $qty;
            }

            $expectedSubtotal = (float) $quote['subtotal'] + (float) ($quote['gift_certificates_purchase_subtotal'] ?? 0);
            abort_if(abs($subtotal - $expectedSubtotal) > 0.02, 422, 'Корзина изменилась, пересчитайте заказ');

            if ($quote['gift_certificate'] instanceof GiftCertificate && $quote['gift_certificate_amount'] > 0) {
                app(GiftCertificateLedgerService::class)->confirmCheckoutDebit(
                    $order,
                    $cart,
                    $quote['gift_certificate'],
                    (float) $quote['gift_certificate_amount']
                );
            }

            $order->update([
                'items_qty' => $itemsQty,
                'subtotal' => $subtotal,
                'delivery_fee' => $quote['delivery_fee'],
                'total' => $quote['total'],
            ]);

            app(SoldGiftCertificateFromOrderService::class)->issueFromPurchases($order);

            if ($partialCheckout) {
                if ($checkoutProductLineIds !== []) {
                    $cart->items()->whereIn('id', $checkoutProductLineIds)->delete();
                }
                if ($checkoutGiftLineIds !== []) {
                    $cart->giftCertificateItems()->whereIn('id', $checkoutGiftLineIds)->delete();
                }
                $cart->refresh()->load(['items', 'giftCertificateItems']);
                if ($cart->items->isEmpty() && $cart->giftCertificateItems->isEmpty()) {
                    $cart->update([
                        'gift_certificate_code' => null,
                        'discount_card_number' => null,
                        'discount_card_session_only' => false,
                    ]);
                } else {
                    app(LoyaltyPricingService::class)->syncGiftCertificateReserveForCart($cart, $user, [
                        'payment_method' => $validated['payment_method'],
                    ]);
                }
            } else {
                $cart->items()->delete();
                $cart->giftCertificateItems()->delete();
                $cart->update([
                    'gift_certificate_code' => null,
                    'discount_card_number' => null,
                    'discount_card_session_only' => false,
                ]);
            }

            return $order;
        });

        $order->load([
            'items',
            'discountCard:id,card_number',
            'orderGiftCertificates',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
        ]);

        DB::transaction(function () use ($order) {
            $order->load('items');
            app(StockInventoryService::class)->reserveForOrder($order);
        });

        $order->load([
            'items',
            'discountCard:id,card_number',
            'orderGiftCertificates',
            'giftCertificatePurchases',
            'soldGiftCertificates.template',
        ]);

        try {
            app(CheckoutTelegramNotificationService::class)->notifyNewOrder($order);
        } catch (Throwable $e) {
            report($e);
        }

        return response()->json([
            'data' => new OrderResource($order),
            'message' => 'Order created successfully',
        ]);
    }

    protected function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    protected function makeVariantDisplayTitle(?ProductVariantLink $variant): string
    {
        if ($variant === null) {
            return '';
        }

        $parts = [];

        if ($variant->volume) {
            $parts[] = trim($variant->volume . ' ' . $variant->volume_unit);
        }

        if ($variant->concentration) {
            $parts[] = strtoupper($variant->concentration);
        }

        if ($variant->edition) {
            $parts[] = $variant->edition;
        }

        return !empty($parts) ? implode(' / ', $parts) : ($variant->title ?? '');
    }

    private function resolveOrderUserId(?CustomerUser $authenticatedUser, string $normalizedPhone): ?int
    {
        if ($normalizedPhone === '') {
            return null;
        }

        $authPhone = $authenticatedUser ? $this->normalizePhone((string) $authenticatedUser->phone) : '';
        if ($authenticatedUser && $authPhone !== '' && $authPhone === $normalizedPhone) {
            return (int) $authenticatedUser->id;
        }

        $exact = CustomerUser::query()
            ->where('phone', $normalizedPhone)
            ->orderBy('id')
            ->first();
        if ($exact) {
            return (int) $exact->id;
        }

        $suffix = strlen($normalizedPhone) >= 9 ? substr($normalizedPhone, -9) : $normalizedPhone;
        if ($suffix === '') {
            return null;
        }

        $matched = CustomerUser::query()
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->first(fn (CustomerUser $candidate) => $this->normalizePhone((string) $candidate->phone) === $normalizedPhone);

        return $matched ? (int) $matched->id : null;
    }
}
