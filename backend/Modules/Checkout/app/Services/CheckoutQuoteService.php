<?php

namespace Modules\Checkout\Services;

use Modules\Cart\Models\Cart;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Services\LoyaltyPricingService;
use Modules\Users\Models\User as CustomerUser;

final class CheckoutQuoteService
{
    public function __construct(
        private readonly LoyaltyPricingService $loyaltyPricing,
        private readonly CheckoutDeliveryService $delivery,
    ) {}

    /**
     * @return array{
     *     subtotal: float,
     *     loyalty_discount_percent: float,
     *     loyalty_discount_amount: float,
     *     discount_card_id: int|null,
     *     discount_card_number: string|null,
     *     gift_certificate: GiftCertificate|null,
     *     gift_certificate_amount: float,
     *     gift_certificates_purchase_subtotal: float,
     *     delivery_fee: float,
     *     total: float,
     *     merchandise_after_loyalty: float
     * }
     */
    public function quote(
        Cart $cart,
        ?CustomerUser $user,
        string $paymentMethod,
        string $deliveryMethod,
    ): array {
        $paymentMethod = $paymentMethod === 'card' ? 'card' : 'cash';

        $pricing = $this->loyaltyPricing->calculateForCart($cart, $user, [
            'payment_method' => $paymentMethod,
        ]);

        $subtotal = (float) $pricing['subtotal'];
        $loyaltyAmount = (float) $pricing['loyalty_discount_amount'];
        $giftPurchasesSubtotal = (float) $cart->giftCertificateItems->sum(function ($row) {
            return ((float) ($row->template?->amount ?? 0)) * (int) $row->qty;
        });
        $merchandiseAfterLoyalty = max(0, round($subtotal - $loyaltyAmount + $giftPurchasesSubtotal, 2));

        $deliveryFee = round($this->delivery->deliveryFee($cart, $deliveryMethod, $merchandiseAfterLoyalty), 2);
        $giftAmount = (float) ($pricing['gift_certificate_amount'] ?? 0);
        /** @var GiftCertificate|null $gift */
        $gift = $pricing['gift_certificate'] ?? null;

        $total = max(0, round($merchandiseAfterLoyalty - $giftAmount + $deliveryFee, 2));

        $discountCard = $pricing['discount_card'] ?? null;

        return [
            'subtotal' => $subtotal,
            'loyalty_discount_percent' => (float) ($pricing['loyalty_discount_percent'] ?? 0),
            'loyalty_discount_amount' => $loyaltyAmount,
            'discount_card_id' => $discountCard?->id,
            'discount_card_number' => $discountCard?->card_number,
            'gift_certificate' => $gift,
            'gift_certificate_amount' => $giftAmount,
            'gift_certificates_purchase_subtotal' => $giftPurchasesSubtotal,
            'delivery_fee' => $deliveryFee,
            'total' => $total,
            'merchandise_after_loyalty' => $merchandiseAfterLoyalty,
        ];
    }

}
