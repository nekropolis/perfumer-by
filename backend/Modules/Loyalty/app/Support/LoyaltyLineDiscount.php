<?php

namespace Modules\Loyalty\Support;

use Modules\Catalog\Support\MoneyDecimal;

/**
 * Построчная скидка накопительной карты относительно скидки товара.
 *
 * D = (old_price − price) / old_price × 100 (0 если скидки нет)
 * доп. процент карты = max(0, C − D)
 * сумма скидки = price × доп.% / 100
 */
final class LoyaltyLineDiscount
{
    /**
     * Скидка карты на одну единицу товара (строка без qty).
     */
    public static function unitAmount(
        mixed $price,
        mixed $oldPrice,
        float $cardPercent,
        bool $isPromotion = false,
    ): string {
        if ($isPromotion) {
            return '0.00';
        }

        $priceNorm = MoneyDecimal::normalize($price);
        if (MoneyDecimal::compare($priceNorm, '0.00') <= 0) {
            return '0.00';
        }

        $extraPercent = self::extraPercent($priceNorm, $oldPrice, $cardPercent);
        if ($extraPercent <= 0) {
            return '0.00';
        }

        $factor = number_format($extraPercent / 100.0, 8, '.', '');

        return bcmul($priceNorm, $factor, 2);
    }

    /**
     * Скидка карты на строку с количеством.
     */
    public static function lineAmount(
        mixed $price,
        mixed $oldPrice,
        float $cardPercent,
        int $qty,
        bool $isPromotion = false,
    ): string {
        $qty = max(0, $qty);
        if ($qty === 0) {
            return '0.00';
        }

        $unit = self::unitAmount($price, $oldPrice, $cardPercent, $isPromotion);
        if (MoneyDecimal::compare($unit, '0.00') <= 0) {
            return '0.00';
        }

        return bcmul($unit, (string) $qty, 2);
    }

    /**
     * Доп. процент карты поверх уже имеющейся скидки товара: max(0, C − D).
     */
    public static function extraPercent(mixed $price, mixed $oldPrice, float $cardPercent): float
    {
        $card = max(0.0, $cardPercent);
        if ($card <= 0) {
            return 0.0;
        }

        $d = self::productDiscountPercent($price, $oldPrice);

        return max(0.0, $card - $d);
    }

    /**
     * Точный процент скидки товара от old_price (не округлённый int для бейджа).
     */
    public static function productDiscountPercent(mixed $price, mixed $oldPrice): float
    {
        if ($oldPrice === null || $oldPrice === '') {
            return 0.0;
        }

        $priceNorm = MoneyDecimal::normalize($price);
        $oldNorm = MoneyDecimal::normalize($oldPrice);

        if (MoneyDecimal::compare($oldNorm, '0.00') <= 0) {
            return 0.0;
        }

        if (MoneyDecimal::compare($oldNorm, $priceNorm) <= 0) {
            return 0.0;
        }

        $diff = bcsub($oldNorm, $priceNorm, 8);
        $ratio = bcdiv($diff, $oldNorm, 8);

        return (float) bcmul($ratio, '100', 6);
    }
}
