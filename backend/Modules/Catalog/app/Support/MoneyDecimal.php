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

    public static function average(string $left, string $right): string
    {
        return bcdiv(bcadd($left, $right, 4), '2', 2);
    }
}
