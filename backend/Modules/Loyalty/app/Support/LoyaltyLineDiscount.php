<?php

namespace Modules\Loyalty\Support;

use Modules\Catalog\Support\MoneyDecimal;

/**
 * Построчная скидка накопительной карты относительно скидки товара.
 *
 * D = (old_price − price) / old_price × 100 (0 если скидки нет)
 * доп. процент карты = max(0, C − D)
 * цена со скидкой округляется вниз до десятых (145,67 → 145,60, всегда в пользу клиента)
 * сумма скидки = price − округлённая цена
 */
final class LoyaltyLineDiscount
{
    /**
     * Цена единицы после скидки карты, вниз до десятых BYN.
     */
    public static function discountedUnitPrice(
        mixed $price,
        mixed $oldPrice,
        float $cardPercent,
        bool $isPromotion = false,
    ): string {
        $priceNorm = MoneyDecimal::normalize($price);
        if ($isPromotion || MoneyDecimal::compare($priceNorm, '0.00') <= 0) {
            return $priceNorm;
        }

        $extraPercent = self::extraPercent($priceNorm, $oldPrice, $cardPercent);
        if ($extraPercent <= 0) {
            return $priceNorm;
        }

        $remainFactor = number_format(max(0.0, 1.0 - ($extraPercent / 100.0)), 8, '.', '');
        $discounted = bcmul($priceNorm, $remainFactor, 4);

        return self::floorToTenths($discounted);
    }

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

        $discounted = self::discountedUnitPrice($priceNorm, $oldPrice, $cardPercent, $isPromotion);
        if (MoneyDecimal::compare($priceNorm, $discounted) <= 0) {
            return '0.00';
        }

        return bcsub($priceNorm, $discounted, 2);
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

    /** 145.67 → 145.60; 145.60 → 145.60. */
    private static function floorToTenths(string $amount): string
    {
        if (MoneyDecimal::compare($amount, '0.00') <= 0) {
            return '0.00';
        }

        $tenths = bcdiv(bcmul($amount, '10', 0), '10', 1);

        return MoneyDecimal::normalize($tenths);
    }
}
