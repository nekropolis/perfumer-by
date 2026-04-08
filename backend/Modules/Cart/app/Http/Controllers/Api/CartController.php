<?php

namespace Modules\Cart\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Cart\Http\Resources\CartResource;
use Modules\Cart\Models\Cart;
use Modules\Cart\Models\CartItem;
use Modules\Catalog\Models\ProductVariant;

class CartController extends Controller
{
    protected function resolveCart(Request $request): Cart
    {
        $token = $request->header('X-Cart-Token') ?: $request->input('cart_token');

        if (!$token) {
            $token = Str::uuid()->toString();
        }

        return Cart::query()->firstOrCreate(
            ['token' => $token],
            ['user_id' => null]
        );
    }

    public function show(Request $request): JsonResponse
    {
        $cart = $this->resolveCart($request);

        $cart->load([
            'items.product.brand',
            'items.variant',
        ]);

        return response()->json([
            'data' => new CartResource($cart),
        ]);
    }

    public function addItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'qty' => ['nullable', 'integer', 'min:1'],
        ]);

        $qty = $validated['qty'] ?? 1;

        $cart = $this->resolveCart($request);

        $variant = ProductVariant::query()
            ->where('id', $validated['variant_id'])
            ->where('is_active', true)
            ->firstOrFail();

        $existingItem = CartItem::query()
            ->where('cart_id', $cart->id)
            ->where('variant_id', $variant->id)
            ->first();

        if ($existingItem) {
            $existingItem->increment('qty', $qty);
        } else {
            CartItem::query()->create([
                'cart_id' => $cart->id,
                'product_id' => $variant->product_id,
                'variant_id' => $variant->id,
                'qty' => $qty,
            ]);
        }

        $cart->refresh()->load([
            'items.product.brand',
            'items.variant',
        ]);

        return response()->json([
            'data' => new CartResource($cart),
        ]);
    }

    public function updateItem(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'qty' => ['required', 'integer', 'min:1'],
        ]);

        $cart = $this->resolveCart($request);

        $item = CartItem::query()
            ->where('cart_id', $cart->id)
            ->where('id', $id)
            ->firstOrFail();

        $item->update([
            'qty' => $validated['qty'],
        ]);

        $cart->refresh()->load([
            'items.product.brand',
            'items.variant',
        ]);

        return response()->json([
            'data' => new CartResource($cart),
        ]);
    }

    public function deleteItem(Request $request, int $id): JsonResponse
    {
        $cart = $this->resolveCart($request);

        $item = CartItem::query()
            ->where('cart_id', $cart->id)
            ->where('id', $id)
            ->firstOrFail();

        $item->delete();

        $cart->refresh()->load([
            'items.product.brand',
            'items.variant',
        ]);

        return response()->json([
            'data' => new CartResource($cart),
        ]);
    }
}
