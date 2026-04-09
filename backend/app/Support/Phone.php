<?php

namespace App\Support;

class Phone
{
    public const REGEX = '/^\+?375[\s\-\(\)]*(25|29|33|44)[\s\-\)]*\d{3}[\s\-]?\d{2}[\s\-]?\d{2}$/';

    public static function normalize(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone);
    }

    public static function isValid(string $phone): bool
    {
        return (bool) preg_match(self::REGEX, $phone);
    }
}
