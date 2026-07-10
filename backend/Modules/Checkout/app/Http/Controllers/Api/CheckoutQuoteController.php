<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Modules\Cart\Models\Cart;
use Modules\Checkout\Services\CheckoutDeliveryService;
use Modules\Checkout\Services\CheckoutQuoteService;
use Modules\Users\Models\Client;

class CheckoutQuoteController extends Controller
{
    public function quote(Request $request, CheckoutQuoteService $quoteService): JsonResponse
    {
        $validated = $request->validate([
            'cart_token' => ['nullable', 'string', 'max:80'],
            'payment_method' => ['required', Rule::in(['cash', 'card'])],
            'delivery_method' => ['required', Rule::in([
                CheckoutDeliveryService::METHOD_MINSK,
                CheckoutDeliveryService::METHOD_BELARUS,
                CheckoutDeliveryService::METHOD_PICKUP,
            ])],
            'cart_item_ids' => ['sometimes', 'array'],
            'cart_item_ids.*' => ['integer', 'min:1'],
            'gift_certificate_cart_item_ids' => ['sometimes', 'array'],
            'gift_certificate_cart_item_ids.*' => ['integer', 'min:1'],
        ]);

        $cartToken = $request->header('X-Cart-Token') ?: $request->input('cart_token') ?: ($validated['cart_token'] ?? null);
        abort_if(!$cartToken, 422, 'Cart token is required');

        $cart = Cart::query()
            ->where('token', $cartToken)
            ->with(['items.variant', 'giftCertificateItems.template'])
            ->first();

        abort_if(!$cart, 422, 'Cart not found');

        $subsetMode = $request->has('cart_item_ids') || $request->has('gift_certificate_cart_item_ids');
        $cartItemIds = $subsetMode
            ? array_values(array_map('intval', $validated['cart_item_ids'] ?? []))
            : null;
        $giftItemIds = $subsetMode
            ? array_values(array_map('intval', $validated['gift_certificate_cart_item_ids'] ?? []))
            : null;

        if ($subsetMode) {
            abort_if($cartItemIds === [] && $giftItemIds === [], 422, 'Выберите хотя бы одну позицию для оформления');
            $allowedProduct = $cart->items->pluck('id')->map(fn ($id) => (int) $id)->all();
            foreach ($cartItemIds as $id) {
                abort_if(!in_array($id, $allowedProduct, true), 422, 'Некорректная позиция корзины');
            }
            $allowedGift = $cart->giftCertificateItems->pluck('id')->map(fn ($id) => (int) $id)->all();
            foreach ($giftItemIds as $id) {
                abort_if(!in_array($id, $allowedGift, true), 422, 'Некорректная позиция подарочного сертификата');
            }
        }

        $client = $request->user() ?? Auth::guard('sanctum')->user();
        $client = $client instanceof Client ? $client : null;
        $quote = $quoteService->quote(
            $cart,
            $client,
            $validated['payment_method'],
            $validated['delivery_method'],
            $cartItemIds,
            $giftItemIds,
        );

        return response()->json([
            'data' => [
                'subtotal' => number_format($quote['subtotal'], 2, '.', ''),
                'gift_certificates_purchase_subtotal' => number_format($quote['gift_certificates_purchase_subtotal'], 2, '.', ''),
                'loyalty_discount_percent' => number_format($quote['loyalty_discount_percent'], 2, '.', ''),
                'loyalty_discount_amount' => number_format($quote['loyalty_discount_amount'], 2, '.', ''),
                'gift_certificate_amount' => number_format($quote['gift_certificate_amount'], 2, '.', ''),
                'delivery_fee' => number_format($quote['delivery_fee'], 2, '.', ''),
                'total' => number_format($quote['total'], 2, '.', ''),
            ],
        ]);
    }
}
