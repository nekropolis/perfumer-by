<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Cart\Models\Cart;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Services\CheckoutDeliveryService;
use Modules\Checkout\Services\CheckoutQuoteService;
use Modules\Checkout\Services\SoldGiftCertificateFromOrderService;
use Modules\Communications\Services\Notifications\CheckoutTelegramNotificationService;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Services\GiftCertificateLedgerService;
use Modules\Users\Models\User as CustomerUser;
use Modules\Warehouse\Services\StockInventoryService;

class CheckoutController extends Controller
{
    public function checkout(Request $request, CheckoutQuoteService $quoteService): JsonResponse
    {
        $validated = $request->validate([
            'customer_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['required', "regex:" . Phone::REGEX],
            'comment' => ['nullable', 'string'],
            'delivery_method' => ['required', Rule::in([
                CheckoutDeliveryService::METHOD_MINSK,
                CheckoutDeliveryService::METHOD_BELARUS,
                CheckoutDeliveryService::METHOD_PICKUP,
            ])],
            'delivery_city' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['required', 'string', 'max:2000'],
            'payment_method' => ['required', Rule::in(['cash', 'card'])],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $user = $request->user();
        $orderUserId = $this->resolveOrderUserId($user, $phone);

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

        if (
            $validated['payment_method'] === 'card'
            && !in_array($validated['delivery_method'], [CheckoutDeliveryService::METHOD_MINSK, CheckoutDeliveryService::METHOD_PICKUP], true)
        ) {
            abort(422, 'Оплата картой доступна только при доставке курьером по Минску или самовывозе');
        }

        if ($validated['delivery_method'] === CheckoutDeliveryService::METHOD_PICKUP) {
            $validated['delivery_address'] = 'нет - самовывоз';
            $validated['delivery_city'] = null;
        }

        foreach ($cart->items as $cartItem) {
            $variant = $cartItem->variant;
            abort_if(!$variant || !$variant->is_active, 422, 'One of the cart items is unavailable');
        }

        $quote = $quoteService->quote($cart, $user, $validated['payment_method'], $validated['delivery_method']);

        $order = DB::transaction(function () use ($cart, $cartToken, $orderUserId, $validated, $phone, $quote) {
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
                'gift_certificate_id' => null,
                'gift_certificate_code' => null,
                'gift_certificate_amount' => 0,
            ]);

            foreach ($cart->items as $cartItem) {
                $price = (float) ($cartItem->variant?->price ?? 0);
                $lineTotal = $price * $cartItem->qty;

                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $cartItem->product_id,
                    'variant_id' => $cartItem->variant_id,
                    'product_name' => $cartItem->product?->name ?? '',
                    'product_slug' => $cartItem->product?->slug,
                    'brand_name' => $cartItem->product?->brand?->name,
                    'variant_title' => $this->makeVariantDisplayTitle($cartItem->variant),
                    'sku' => null,
                    'qty' => $cartItem->qty,
                    'price' => $price,
                    'total' => $lineTotal,
                ]);

                $subtotal += $lineTotal;
                $itemsQty += $cartItem->qty;
            }

            foreach ($cart->giftCertificateItems as $giftCartItem) {
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

            $giftPatch = [];
            if ($quote['gift_certificate'] instanceof GiftCertificate && $quote['gift_certificate_amount'] > 0) {
                $certificate = $quote['gift_certificate'];
                app(GiftCertificateLedgerService::class)->confirmCheckoutDebit(
                    $order,
                    $cart,
                    $certificate,
                    (float) $quote['gift_certificate_amount']
                );
                $giftPatch = [
                    'gift_certificate_id' => $certificate->id,
                    'gift_certificate_code' => $certificate->code,
                    'gift_certificate_amount' => round((float) $quote['gift_certificate_amount'], 2),
                ];
            }

            $order->update(array_merge([
                'items_qty' => $itemsQty,
                'subtotal' => $subtotal,
                'delivery_fee' => $quote['delivery_fee'],
                'total' => $quote['total'],
            ], $giftPatch));

            app(SoldGiftCertificateFromOrderService::class)->issueFromPurchases($order);

            $cart->items()->delete();
            $cart->giftCertificateItems()->delete();
            $cart->update([
                'gift_certificate_code' => null,
                'discount_card_number' => null,
                'discount_card_session_only' => false,
            ]);

            return $order;
        });

        $order->load(['items', 'orderGiftCertificates', 'giftCertificatePurchases', 'soldGiftCertificates.template']);

        DB::transaction(function () use ($order) {
            $order->load('items');
            app(StockInventoryService::class)->reserveForOrder($order);
        });

        $order->load(['items', 'orderGiftCertificates', 'giftCertificatePurchases', 'soldGiftCertificates.template']);

        app(CheckoutTelegramNotificationService::class)->notifyNewOrder($order);

        return response()->json([
            'data' => new OrderResource($order),
            'message' => 'Order created successfully',
        ]);
    }

    protected function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    protected function makeVariantDisplayTitle($variant): string
    {
        if (!$variant) {
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
