<?php

namespace Modules\Checkout\Services;

use Modules\Catalog\Models\ProductVariantLink;
use Modules\Checkout\Models\Order;
use Modules\Loyalty\Models\DiscountCard;
use Modules\Loyalty\Models\GiftCertificate;
use Modules\Loyalty\Services\GiftCertificateLedgerService;

final class AdminOrderPricingService
{
    public function __construct(
        private readonly GiftCertificateLedgerService $giftLedger,
    ) {}

    /**
     * @param  array<int, array{qty: int, price: float|int|string, variant_id?: int|null}>  $items
     * @return array{
     *     subtotal: float,
     *     loyalty_discount_percent: float,
     *     loyalty_discount_amount: float,
     *     discount_card_id: int|null,
     *     discount_card_number: string|null,
     *     gift_certificate: GiftCertificate|null,
     *     gift_certificate_code: string|null,
     *     gift_certificate_amount: float,
     *     merchandise_total: float,
     *     total_before_delivery: float
     * }
     */
    public function quote(
        array $items,
        string $paymentMethod,
        ?string $discountCardNumber,
        ?string $giftCertificateCode = null,
        ?Order $forOrder = null,
    ): array {
        $subtotal = $this->itemsSubtotal($items);
        $applyCardDiscount = $paymentMethod !== 'card';
        $card = $this->resolveDiscountCard($discountCardNumber);
        $percent = $card && $applyCardDiscount
            ? DiscountCard::effectiveDiscountPercent((float) $card->discount_percent)
            : 0.0;
        $loyaltyEligibleSubtotal = $this->loyaltyEligibleSubtotal($items);
        $loyaltyAmount = $card && $applyCardDiscount
            ? round($loyaltyEligibleSubtotal * ($percent / 100), 2)
            : 0.0;
        $merchandiseTotal = max(0, round($subtotal - $loyaltyAmount, 2));

        $gift = $this->resolveGiftCertificate($giftCertificateCode, $forOrder);
        $giftAmount = 0.0;
        if ($gift) {
            $avail = $this->giftLedger->availableAmountForAdminOrder($gift, $forOrder);
            $giftAmount = round(min($avail, $merchandiseTotal), 2);
        }

        return [
            'subtotal' => round($subtotal, 2),
            'loyalty_discount_percent' => $percent,
            'loyalty_discount_amount' => $loyaltyAmount,
            'discount_card_id' => $card?->id,
            'discount_card_number' => $card?->card_number,
            'gift_certificate' => $gift,
            'gift_certificate_code' => $gift?->code,
            'gift_certificate_amount' => $giftAmount,
            'merchandise_total' => $merchandiseTotal,
            'total_before_delivery' => max(0, round($merchandiseTotal - $giftAmount, 2)),
        ];
    }

    public function resolveDiscountCard(?string $discountCardNumber): ?DiscountCard
    {
        $number = trim((string) $discountCardNumber);
        if ($number === '') {
            return null;
        }

        return DiscountCard::query()
            ->where('card_number', $number)
            ->where('status', DiscountCard::STATUS_ACTIVE)
            ->first();
    }

    /**
     * @return array{message: string, code: string}|null null если код пустой или сертификат можно применить
     */
    public function giftCertificateValidationError(?string $giftCertificateCode, ?Order $forOrder = null): ?array
    {
        $code = trim((string) $giftCertificateCode);
        if ($code === '') {
            return null;
        }

        $cert = GiftCertificate::query()->where('code', $code)->first();

        return $this->giftLedger->giftCertificateAdminApplyBlock($cert, $forOrder);
    }

    public function resolveGiftCertificate(?string $giftCertificateCode, ?Order $forOrder = null): ?GiftCertificate
    {
        $code = trim((string) $giftCertificateCode);
        if ($code === '') {
            return null;
        }

        $cert = GiftCertificate::query()->where('code', $code)->first();
        if ($this->giftLedger->giftCertificateAdminApplyBlock($cert, $forOrder) !== null) {
            return null;
        }

        return $cert;
    }

    /**
     * @param  array<int, array{qty: int, price: float|int|string, variant_id?: int|null}>  $items
     */
    private function itemsSubtotal(array $items): float
    {
        $subtotal = 0.0;
        foreach ($items as $item) {
            $qty = max(0, (int) ($item['qty'] ?? 0));
            $price = round((float) ($item['price'] ?? 0), 2);
            $subtotal += round($qty * $price, 2);
        }

        return round($subtotal, 2);
    }

    /**
     * @param  array<int, array{qty: int, price: float|int|string, variant_id?: int|null}>  $items
     */
    private function loyaltyEligibleSubtotal(array $items): float
    {
        $variantIds = [];
        foreach ($items as $item) {
            $variantId = (int) ($item['variant_id'] ?? 0);
            if ($variantId > 0) {
                $variantIds[$variantId] = true;
            }
        }

        $promotionVariantIds = [];
        if ($variantIds !== []) {
            $promotionVariantIds = ProductVariantLink::query()
                ->whereIn('id', array_keys($variantIds))
                ->where('is_promotion', true)
                ->pluck('id')
                ->flip()
                ->all();
        }

        $eligible = 0.0;
        foreach ($items as $item) {
            $variantId = (int) ($item['variant_id'] ?? 0);
            if ($variantId > 0 && isset($promotionVariantIds[$variantId])) {
                continue;
            }

            $qty = max(0, (int) ($item['qty'] ?? 0));
            $price = round((float) ($item['price'] ?? 0), 2);
            $eligible += round($qty * $price, 2);
        }

        return round($eligible, 2);
    }
}
