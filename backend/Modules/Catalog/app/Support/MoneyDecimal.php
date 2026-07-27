<?php

namespace Modules\Catalog\Support;

final class MoneyDecimal
{
    public static function normalize(mixed $value): string
    {
        if ($value === null || $value === '') {
            return '0.00';
        }

        return number_format((float) $value, 2, '.', '');
    }

    public static function compare(string $left, string $right): int
    {
        return bccomp($left, $right, 4);
    }

    public static function isLessThan(string $left, string $right): bool
    {
        return self::compare($left, $right) < 0;
    }

    public static function isLessOrEqual(string $left, string $right): bool
    {
        return self::compare($left, $right) <= 0;
    }

    public static function average(string $left, string $right): string
    {
        return bcdiv(bcadd($left, $right, 4), '2', 2);
    }

    /** (warehouse + offer*2) / 3 */
    public static function warehouseOfferBlend(string $warehouse, string $offer): string
    {
        $sum = bcadd($warehouse, bcmul($offer, '2', 4), 4);

        return bcdiv($sum, '3', 2);
    }

    /** Absolute relative difference vs $base: |a-b|/base * 100 */
    public static function percentDiffAbs(string $a, string $b, string $base): float
    {
        $baseNorm = self::normalize($base);
        if (self::compare($baseNorm, '0') <= 0) {
            return 0.0;
        }

        $diff = abs((float) bcsub($a, $b, 4));

        return ($diff / (float) $baseNorm) * 100.0;
    }

    public static function percentOff(string $amount, float $percent): string
    {
        $factor = number_format(max(0.0, 1.0 - ($percent / 100.0)), 6, '.', '');

        return bcmul(self::normalize($amount), $factor, 2);
    }

    public static function multiply(string $amount, float $factor): string
    {
        return bcmul(self::normalize($amount), number_format($factor, 6, '.', ''), 2);
    }
}
