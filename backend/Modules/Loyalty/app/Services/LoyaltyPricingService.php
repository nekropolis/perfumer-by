<?php

namespace Modules\Loyalty\Services;

use Modules\Cart\Models\Cart;
use Modules\Catalog\Support\WaitingDiscountPricing;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\ClientDiscountCard;
use Modules\Users\Models\Client;

class LoyaltyPricingService
{
    public function __construct(
        private readonly GiftCertificateLedgerService $giftLedger,
    ) {}

    /**
     * @param  array{payment_method?: string, checkout_cart_item_ids?: int[]|null}  $options
     */
    public function syncGiftCertificateReserveForCart(Cart $cart, ?Client $client = null, array $options = []): void
    {
        $paymentMethod = (string) ($options['payment_method'] ?? 'cash');
        $applyCardDiscount = $paymentMethod !== 'card';

        $subtotal = $this->cartSubtotal($cart, $options['checkout_cart_item_ids'] ?? null);
        $loyaltyDiscount = $this->loyaltyDiscountAmount(
            $cart,
            $client,
            $applyCardDiscount,
            $options['checkout_cart_item_ids'] ?? null,
        );
        $payableBeforeCert = max(0, round($subtotal - $loyaltyDiscount, 2));

        $code = trim((string) $cart->gift_certificate_code);
        if ($code === '') {
            $this->giftLedger->releaseAllReservesForCartToken((string) $cart->token);

            return;
        }

        $cert = GiftCertificate::query()->where('code', $code)->first();
        if (!$cert || !$this->giftLedger->certificateIsUsable($cert)) {
            $this->giftLedger->releaseAllReservesForCartToken((string) $cart->token);
            if ($cart->exists) {
                $cart->forceFill(['gift_certificate_code' => null])->saveQuietly();
            }

            return;
        }

        $this->giftLedger->syncReserveForCart($cart, $cert, $payableBeforeCert);
    }

    /**
     * @param  array{
     *     payment_method?: string,
     *     checkout_cart_item_ids?: int[]|null,
     * }  $options
     *                         payment_method: cash|card — при card скидка по карте не начисляется,
     *                         но карта из корзины/аккаунта всё равно возвращается в discount_card для снимка заказа и лояльности при completed.
     *                         checkout_cart_item_ids: при непустом массиве — только эти строки корзины (id cart_items) в сумме и в резерве сертификата;
     *                         при null — все строки (поведение по умолчанию).
     */
    public function calculateForCart(Cart $cart, ?Client $client = null, array $options = []): array
    {
        $paymentMethod = (string) ($options['payment_method'] ?? 'cash');
        $applyCardDiscount = $paymentMethod !== 'card';

        $this->syncGiftCertificateReserveForCart($cart, $client, $options);
        $cart->refresh();

        $subtotal = $this->cartSubtotal($cart, $options['checkout_cart_item_ids'] ?? null);
        $resolvedCard = $this->resolveDiscountCard($cart, $client);
        $cardForDiscount = $applyCardDiscount ? $resolvedCard : null;
        $cardPercent = $cardForDiscount
            ? DiscountCard::effectiveDiscountPercent((float) $cardForDiscount->discount_percent)
            : 0.0;
        $loyaltyDiscount = $cardForDiscount
            ? $this->loyaltyDiscountAmount($cart, $client, true, $options['checkout_cart_item_ids'] ?? null)
            : 0.0;

        $certificate = $this->resolveGiftCertificate($cart);
        $certificateAmount = 0.0;
        if ($certificate) {
            $certificateAmount = $this->giftLedger->activeReservedAmountForCart($certificate, (string) $cart->token);
        }

        return [
            'subtotal' => round($subtotal, 2),
            'discount_card' => $resolvedCard,
            'loyalty_discount_percent' => $cardPercent,
            'loyalty_discount_amount' => $loyaltyDiscount,
            'gift_certificate' => $certificate,
            'gift_certificate_amount' => $certificateAmount,
            'total' => max(0, round($subtotal - $loyaltyDiscount - $certificateAmount, 2)),
        ];
    }

    public function resolveGiftCertificate(Cart $cart): ?GiftCertificate
    {
        $code = trim((string) $cart->gift_certificate_code);
        if ($code === '') {
            return null;
        }

        $cert = GiftCertificate::query()->where('code', $code)->first();
        if (!$cert || !$this->giftLedger->certificateIsUsable($cert)) {
            return null;
        }

        return $cert;
    }

    public function resolveDiscountCard(Cart $cart, ?Client $client = null): ?DiscountCard
    {
        $number = trim((string) $cart->discount_card_number);
        if ($number === Cart::DISCOUNT_CARD_SUPPRESS_PROFILE_MARKER) {
            return null;
        }
        if ($number !== '') {
            $card = DiscountCard::query()
                ->where('card_number', $number)
                ->where('status', DiscountCard::STATUS_ACTIVE)
                ->first();
            if (!$card) {
                return $this->resolveClientVerifiedCard($client);
            }

            if (! $client || $cart->discount_card_session_only) {
                return $card;
            }

            if ($this->clientHasVerifiedLink($client, $card)) {
                return $card;
            }

            return $card;
        }

        if (! $client) {
            return null;
        }

        return $this->resolveClientVerifiedCard($client);
    }

    private function resolveClientVerifiedCard(?Client $client): ?DiscountCard
    {
        if (! $client) {
            return null;
        }

        return $client->discountCards()
            ->where('discount_cards.status', DiscountCard::STATUS_ACTIVE)
            ->wherePivot('link_status', ClientDiscountCard::LINK_VERIFIED)
            ->orderByDesc('discount_percent')
            ->first();
    }

    /**
     * @param  int[]|null  $onlyCartItemIds  null — все позиции; [] — сумма товаров 0; иначе только id строк корзины.
     */
    private function cartSubtotal(Cart $cart, ?array $onlyCartItemIds = null): float
    {
        $rows = $cart->items;
        if ($onlyCartItemIds !== null) {
            if ($onlyCartItemIds === []) {
                return 0.0;
            }
            $allowed = array_fill_keys(array_map('intval', $onlyCartItemIds), true);
            $rows = $rows->filter(fn ($item) => isset($allowed[(int) $item->id]));
        }

        return (float) $rows->sum(function ($item) {
            $basePrice = (float) ($item->variant?->price ?? 0);
            if ($basePrice <= 0) {
                return 0.0;
            }

            if ((bool) $item->waiting_discount && !(bool) ($item->variant?->is_promotion ?? false)) {
                $basePrice = WaitingDiscountPricing::apply($basePrice);
            }

            return $basePrice * (int) $item->qty;
        });
    }

    /**
     * @param  int[]|null  $onlyCartItemIds
     */
    private function loyaltyDiscountAmount(
        Cart $cart,
        ?Client $client,
        bool $applyCardDiscount,
        ?array $onlyCartItemIds = null,
    ): float {
        if (!$applyCardDiscount) {
            return 0.0;
        }

        $eligibleSubtotal = $this->cartLoyaltyEligibleSubtotal($cart, $onlyCartItemIds);
        if ($eligibleSubtotal <= 0) {
            return 0.0;
        }

        $card = $this->resolveDiscountCard($cart, $client);
        $cardPercent = $card ? DiscountCard::effectiveDiscountPercent((float) $card->discount_percent) : 0.0;

        return round($eligibleSubtotal * ($cardPercent / 100), 2);
    }

    /**
     * Сумма строк корзины, к которым применяется скидка по карте (без акционных вариантов).
     *
     * @param  int[]|null  $onlyCartItemIds
     */
    private function cartLoyaltyEligibleSubtotal(Cart $cart, ?array $onlyCartItemIds = null): float
    {
        $rows = $cart->items;
        if ($onlyCartItemIds !== null) {
            if ($onlyCartItemIds === []) {
                return 0.0;
            }
            $allowed = array_fill_keys(array_map('intval', $onlyCartItemIds), true);
            $rows = $rows->filter(fn ($item) => isset($allowed[(int) $item->id]));
        }

        return (float) $rows->sum(function ($item) {
            if ((bool) ($item->variant?->is_promotion ?? false)) {
                return 0.0;
            }

            return ((float) ($item->variant?->price ?? 0)) * (int) $item->qty;
        });
    }

    private function clientHasVerifiedLink(Client $client, DiscountCard $card): bool
    {
        return $client->discountCards()
            ->where('discount_cards.id', $card->id)
            ->wherePivot('link_status', ClientDiscountCard::LINK_VERIFIED)
            ->exists();
    }

}
