<?php

namespace Modules\Cart\Http\Controllers\Api;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\GiftCertificateTemplate;
use Modules\Loyalty\Models\UserDiscountCard;
use Modules\Loyalty\Services\GiftCertificateLedgerService;
use Modules\Cart\Http\Resources\CartResource;
use Modules\Cart\Models\Cart;
use Modules\Cart\Models\CartItem;
use Modules\Catalog\Models\ProductVariantLink;

class CartController extends Controller
{
    private function resolveAuthenticatedUser(Request $request): ?Authenticatable
    {
        return $request->user() ?? Auth::guard('sanctum')->user();
    }

    protected function resolveCart(Request $request): Cart
    {
        $token = $request->header('X-Cart-Token') ?: $request->input('cart_token');

        if (!$token) {
            $token = Str::uuid()->toString();
        }

        $cart = Cart::query()->firstOrCreate(
            ['token' => $token],
            ['user_id' => null]
        );

        $user = $this->resolveAuthenticatedUser($request);
        if ($user && !$cart->user_id) {
            $cart->update(['user_id' => $user->id]);
        }

        return $cart;
    }

    public function show(Request $request): JsonResponse
    {
        $cart = $this->resolveCart($request);

        if ($request->header('X-Cart-Loyalty-Bootstrap') === 'reload') {
            $cart->update([
                'discount_card_number' => null,
                'discount_card_session_only' => false,
            ]);
            $cart->refresh();
        }

        $cart->load([
            'items.product.brand',
            'items.variant',
            'giftCertificateItems.template',
        ]);

        return response()->json([
            'data' => new CartResource($cart),
        ]);
    }

    public function addItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'variant_id' => ['required', 'integer', 'exists:product_variant_links,id'],
            'qty' => ['nullable', 'integer', 'min:1'],
        ]);

        $qty = $validated['qty'] ?? 1;

        $cart = $this->resolveCart($request);

        $variant = ProductVariantLink::query()
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
            'giftCertificateItems.template',
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
            'giftCertificateItems.template',
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
            'giftCertificateItems.template',
        ]);

        return response()->json([
            'data' => new CartResource($cart),
        ]);
    }

    public function applyGiftCertificate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['nullable', 'string', 'max:64'],
            'number' => ['nullable', 'string', 'max:64'],
        ]);

        $cart = $this->resolveCart($request);
        $code = trim((string) ($validated['code'] ?? $validated['number'] ?? ''));
        if ($code === '') {
            return response()->json([
                'message' => 'Введите код подарочного сертификата.',
                'code' => 'GIFT_CERTIFICATE_CODE_REQUIRED',
            ], 422);
        }

        $certificate = GiftCertificate::query()->where('code', $code)->first();
        $ledger = app(GiftCertificateLedgerService::class);
        $block = $ledger->giftCertificateApplyBlock($certificate);
        if ($block !== null) {
            return response()->json([
                'message' => $block['message'],
                'code' => $block['code'],
            ], 422);
        }

        $ledger->releaseAllReservesForCartToken($cart->token);
        $cart->update(['gift_certificate_code' => $certificate->code]);
        $cart->refresh()->load(['items.product.brand', 'items.variant']);
        $cart->load('giftCertificateItems.template');

        return response()->json(['data' => new CartResource($cart)]);
    }

    public function clearGiftCertificate(Request $request): JsonResponse
    {
        $cart = $this->resolveCart($request);
        app(GiftCertificateLedgerService::class)->releaseAllReservesForCartToken($cart->token);
        $cart->update(['gift_certificate_code' => null]);
        $cart->refresh()->load(['items.product.brand', 'items.variant']);
        $cart->load('giftCertificateItems.template');

        return response()->json(['data' => new CartResource($cart)]);
    }

    public function applyDiscountCard(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'number' => ['required', 'string', 'max:64'],
            'session_only' => ['sometimes', 'boolean'],
        ]);

        $cart = $this->resolveCart($request);
        $number = trim($validated['number']);
        if ($number === Cart::DISCOUNT_CARD_SUPPRESS_PROFILE_MARKER) {
            return response()->json([
                'message' => 'Некорректный номер карты.',
                'code' => 'DISCOUNT_CARD_INVALID',
            ], 422);
        }
        $user = $this->resolveAuthenticatedUser($request);
        $sessionOnly = (bool) ($validated['session_only'] ?? false);

        $card = DiscountCard::query()
            ->where('card_number', $number)
            ->first();

        if (!$card) {
            return response()->json([
                'message' => 'Такой карты лояльности нет, проверьте номер.',
                'code' => 'DISCOUNT_CARD_NOT_FOUND',
            ], 422);
        }

        if ($card->status !== DiscountCard::STATUS_ACTIVE) {
            return response()->json([
                'message' => 'Карта недействительна, свяжитесь с менеджером магазина.',
                'code' => 'DISCOUNT_CARD_INACTIVE',
            ], 422);
        }

        if ($user && !$sessionOnly) {
            $linkedToSelf = $user->discountCards()
                ->where('discount_cards.id', $card->id)
                ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
                ->exists();

            $linkedToOtherCard = $user->discountCards()
                ->where('discount_cards.id', '<>', $card->id)
                ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
                ->exists();

            if ($linkedToOtherCard && !$linkedToSelf) {
                return response()->json([
                    'message' => 'К вашему аккаунту уже привязана другая карта. У клиента может быть только одна карта.',
                    'code' => 'USER_ALREADY_HAS_DISCOUNT_CARD',
                ], 422);
            }

            // В корзине/checkout карту не привязываем к профилю.
            // Привязка разрешена только в ЛК или через админку.
        }

        $guestSessionOnly = !$user;
        $cart->update([
            'discount_card_number' => $number,
            'discount_card_session_only' => $guestSessionOnly || $sessionOnly,
        ]);
        $cart->refresh()->load(['items.product.brand', 'items.variant']);
        $cart->load('giftCertificateItems.template');

        return response()->json(['data' => new CartResource($cart)]);
    }

    public function clearDiscountCard(Request $request): JsonResponse
    {
        $cart = $this->resolveCart($request);
        $user = $this->resolveAuthenticatedUser($request);

        $number = trim((string) $cart->discount_card_number);
        $isMarker = $number === Cart::DISCOUNT_CARD_SUPPRESS_PROFILE_MARKER;
        $hasStoredRealNumber = $number !== '' && !$isMarker;

        if ($user && $cart->discount_card_session_only && $hasStoredRealNumber) {
            // Временная «другая карта» для заказа — возвращаем профильную.
            $cart->update([
                'discount_card_number' => null,
                'discount_card_session_only' => false,
            ]);
        } elseif ($user) {
            // Убираем профильную из черновика заказа или готовим ввод другой карты (до перезагрузки страницы).
            $cart->update([
                'discount_card_number' => Cart::DISCOUNT_CARD_SUPPRESS_PROFILE_MARKER,
                'discount_card_session_only' => false,
            ]);
        } else {
            $cart->update([
                'discount_card_number' => null,
                'discount_card_session_only' => false,
            ]);
        }

        $cart->refresh()->load(['items.product.brand', 'items.variant']);
        $cart->load('giftCertificateItems.template');

        return response()->json(['data' => new CartResource($cart)]);
    }

    public function templates(): JsonResponse
    {
        $items = GiftCertificateTemplate::query()
            ->where('is_active', true)
            ->orderBy('amount')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function addGiftCertificateItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'template_id' => ['required', 'integer', 'exists:gift_certificate_templates,id'],
            'qty' => ['nullable', 'integer', 'min:1'],
        ]);

        $qty = (int) ($validated['qty'] ?? 1);
        $cart = $this->resolveCart($request);
        $template = GiftCertificateTemplate::query()
            ->where('id', $validated['template_id'])
            ->where('is_active', true)
            ->firstOrFail();

        $existing = $cart->giftCertificateItems()->where('template_id', $template->id)->first();
        if ($existing) {
            $existing->increment('qty', $qty);
        } else {
            $cart->giftCertificateItems()->create([
                'template_id' => $template->id,
                'qty' => $qty,
            ]);
        }

        $cart->refresh()->load(['items.product.brand', 'items.variant', 'giftCertificateItems.template']);

        return response()->json(['data' => new CartResource($cart)]);
    }

    public function updateGiftCertificateItem(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'qty' => ['required', 'integer', 'min:1'],
        ]);

        $cart = $this->resolveCart($request);
        $item = $cart->giftCertificateItems()->whereKey($id)->firstOrFail();
        $item->update(['qty' => (int) $validated['qty']]);

        $cart->refresh()->load(['items.product.brand', 'items.variant', 'giftCertificateItems.template']);

        return response()->json(['data' => new CartResource($cart)]);
    }

    public function deleteGiftCertificateItem(Request $request, int $id): JsonResponse
    {
        $cart = $this->resolveCart($request);
        $item = $cart->giftCertificateItems()->whereKey($id)->firstOrFail();
        $item->delete();

        $cart->refresh()->load(['items.product.brand', 'items.variant', 'giftCertificateItems.template']);

        return response()->json(['data' => new CartResource($cart)]);
    }
}
