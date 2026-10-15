<?php

namespace App\Support;

final class LogRedaction
{
    /** Последние 4 цифры, остальное скрыто: ***1234. */
    public static function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        $tail = $digits === '' ? '' : substr($digits, -4);

        return '***'.$tail;
    }

    /** Последовательности из 7+ цифр (телефоны в тексте) → *** и последние 4. */
    public static function maskDigitRuns(string $value): string
    {
        $masked = preg_replace_callback(
            '/\d{7,}/',
            static fn (array $matches): string => '***'.substr($matches[0], -4),
            $value,
        );

        return is_string($masked) ? $masked : $value;
    }

    public static function truncate(string $value, int $limit): string
    {
        if (mb_strlen($value) <= $limit) {
            return $value;
        }

        return mb_substr($value, 0, $limit);
    }
}
