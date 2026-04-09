<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Cart\Models\Cart;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;

class CheckoutController extends Controller
{
    public function checkout(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_name' => ['nullable', 'string', 'max:255'],
            'phone'         => ['required', "regex:" . Phone::REGEX],
            'comment'       => ['nullable', 'string'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $user = $request->user();

        $cartToken = $request->header('X-Cart-Token') ?: $request->input('cart_token');

        abort_if(!$cartToken, 422, 'Cart token is required');

        $cart = Cart::query()
            ->where('token', $cartToken)
            ->with([
                'items.product.brand',
                'items.variant',
            ])
            ->first();

        abort_if(!$cart, 422, 'Cart not found');
        abort_if($cart->items->isEmpty(), 422, 'Cart is empty');

        $subtotal = 0;
        $itemsQty = 0;

        $order = Order::query()->create([
            'user_id' => $user?->id,
            'cart_token' => $cartToken,
            'customer_name' => $validated['customer_name'] ?? null,
            'phone' => $phone,
            'comment' => $validated['comment'] ?? null,
            'status' => 'new',
            'items_qty' => 0,
            'subtotal' => 0,
            'total' => 0,
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
                'variant_title' => $cartItem->variant?->title ?? '',
                'sku' => $cartItem->variant?->sku,
                'qty' => $cartItem->qty,
                'price' => $price,
                'total' => $lineTotal,
            ]);

            $subtotal += $lineTotal;
            $itemsQty += $cartItem->qty;
        }

        $order->update([
            'items_qty' => $itemsQty,
            'subtotal' => $subtotal,
            'total' => $subtotal,
        ]);

        $cart->items()->delete();

        $order->load('items');

        return response()->json([
            'data' => new OrderResource($order),
            'message' => 'Order created successfully',
        ]);
    }

    protected function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }
}

