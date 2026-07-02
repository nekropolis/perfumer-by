<?php

namespace Modules\Catalog\Support;

final class WaitingDiscountPricing
{
    public const DISCOUNT_PERCENT = 3.0;

    /**
     * Скидка 3% за ожидание доставки.
     * Итоговая цена округляется вниз до целых BYN (например 25,026 → 25,00).
     */
    public static function apply(float $price): float
    {
        if ($price <= 0) {
            return 0.0;
        }

        $discounted = $price * (1 - self::DISCOUNT_PERCENT / 100);

        return (float) floor($discounted);
    }

    public static function discountAmount(float $price): float
    {
        if ($price <= 0) {
            return 0.0;
        }

        return round($price - self::apply($price), 2);
    }
}
