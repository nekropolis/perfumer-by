<?php

namespace Modules\Checkout\Services;

use Modules\Loyalty\Models\DiscountCard;

final class AdminOrderPricingService
{
    /**
     * @param  array<int, array{qty: int, price: float|int|string}>  $items
     * @return array{
     *     subtotal: float,
     *     loyalty_discount_percent: float,
     *     loyalty_discount_amount: float,
     *     discount_card_id: int|null,
     *     discount_card_number: string|null,
     *     merchandise_total: float
     * }
     */
    public function quote(
        array $items,
        string $paymentMethod,
        ?string $discountCardNumber,
    ): array {
        $subtotal = $this->itemsSubtotal($items);
        $applyCardDiscount = $paymentMethod !== 'card';
        $card = $this->resolveDiscountCard($discountCardNumber);
        $percent = $card && $applyCardDiscount
            ? DiscountCard::effectiveDiscountPercent((float) $card->discount_percent)
            : 0.0;
        $loyaltyAmount = $card && $applyCardDiscount
            ? round($subtotal * ($percent / 100), 2)
            : 0.0;
        $merchandiseTotal = max(0, round($subtotal - $loyaltyAmount, 2));

        return [
            'subtotal' => round($subtotal, 2),
            'loyalty_discount_percent' => $percent,
            'loyalty_discount_amount' => $loyaltyAmount,
            'discount_card_id' => $card?->id,
            'discount_card_number' => $card?->card_number,
            'merchandise_total' => $merchandiseTotal,
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
     * @param  array<int, array{qty: int, price: float|int|string}>  $items
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
}
