<?php

namespace Modules\Loyalty\Services;

use Modules\Cart\Models\Cart;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Models\UserDiscountCard;
use Modules\Users\Models\User as CustomerUser;

class LoyaltyPricingService
{
    public function __construct(
        private readonly GiftCertificateLedgerService $giftLedger,
    ) {}

    /**
     * @param  array{payment_method?: string}  $options
     */
    public function syncGiftCertificateReserveForCart(Cart $cart, ?CustomerUser $user = null, array $options = []): void
    {
        $paymentMethod = (string) ($options['payment_method'] ?? 'cash');
        $applyCardDiscount = $paymentMethod !== 'card';

        $subtotal = $this->cartSubtotal($cart);
        $loyaltyDiscount = $this->loyaltyDiscountAmount($cart, $user, $subtotal, $applyCardDiscount);
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
     * @param  array{payment_method?: string}  $options
     *                         payment_method: cash|card — при card скидка по карте не начисляется.
     */
    public function calculateForCart(Cart $cart, ?CustomerUser $user = null, array $options = []): array
    {
        $paymentMethod = (string) ($options['payment_method'] ?? 'cash');
        $applyCardDiscount = $paymentMethod !== 'card';

        $this->syncGiftCertificateReserveForCart($cart, $user, $options);
        $cart->refresh();

        $subtotal = $this->cartSubtotal($cart);
        $card = $applyCardDiscount ? $this->resolveDiscountCard($cart, $user) : null;
        $cardPercent = $card ? DiscountCard::effectiveDiscountPercent((float) $card->discount_percent) : 0.0;
        $loyaltyDiscount = $this->loyaltyDiscountAmount($cart, $user, $subtotal, $applyCardDiscount);

        $certificate = $this->resolveGiftCertificate($cart);
        $certificateAmount = 0.0;
        if ($certificate) {
            $certificateAmount = $this->giftLedger->activeReservedAmountForCart($certificate, (string) $cart->token);
        }

        return [
            'subtotal' => round($subtotal, 2),
            'discount_card' => $card,
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

    public function resolveDiscountCard(Cart $cart, ?CustomerUser $user = null): ?DiscountCard
    {
        $number = trim((string) $cart->discount_card_number);
        if ($number !== '') {
            $card = DiscountCard::query()
                ->where('card_number', $number)
                ->where('status', DiscountCard::STATUS_ACTIVE)
                ->first();
            if (!$card) {
                return $this->resolveUserVerifiedCard($user);
            }

            if (!$user || $cart->discount_card_session_only) {
                return $card;
            }

            if ($this->userHasVerifiedLink($user, $card)) {
                return $card;
            }

            return $card;
        }

        if (!$user) {
            return null;
        }

        return $this->resolveUserVerifiedCard($user);
    }

    private function resolveUserVerifiedCard(?CustomerUser $user): ?DiscountCard
    {
        if (!$user) {
            return null;
        }

        return $user->discountCards()
            ->where('discount_cards.status', DiscountCard::STATUS_ACTIVE)
            ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
            ->orderByDesc('discount_percent')
            ->first();
    }

    private function cartSubtotal(Cart $cart): float
    {
        return (float) $cart->items->sum(function ($item) {
            return ((float) ($item->variant?->price ?? 0)) * (int) $item->qty;
        });
    }

    private function loyaltyDiscountAmount(Cart $cart, ?CustomerUser $user, float $subtotal, bool $applyCardDiscount): float
    {
        if (!$applyCardDiscount) {
            return 0.0;
        }

        $card = $this->resolveDiscountCard($cart, $user);
        $cardPercent = $card ? DiscountCard::effectiveDiscountPercent((float) $card->discount_percent) : 0.0;

        return round($subtotal * ($cardPercent / 100), 2);
    }

    private function userHasVerifiedLink(CustomerUser $user, DiscountCard $card): bool
    {
        return $user->discountCards()
            ->where('discount_cards.id', $card->id)
            ->wherePivot('link_status', UserDiscountCard::LINK_VERIFIED)
            ->exists();
    }

}
