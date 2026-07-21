<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

class Phone
{
    public const REGEX = '/^\+?375[\s\-\(\)]*(25|29|33|44)[\s\-\)]*\d{3}[\s\-]?\d{2}[\s\-]?\d{2}$/';

    /** Только цифры: 8–15 (режим «Международный номер» / международный номер с кодом страны). */
    public const REGEX_PLAIN_BY_DIGITS = '/^\d{8,15}$/';

    public static function normalize(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    public static function isValid(string $phone): bool
    {
        return (bool) preg_match(self::REGEX, $phone);
    }

    public static function isValidPlainBy(string $phone): bool
    {
        $digits = self::normalize($phone);

        return $digits !== '' && (bool) preg_match(self::REGEX_PLAIN_BY_DIGITS, $digits);
    }

    /**
     * Мобильный формат (REGEX) или «Международный номер» (8–15 цифр с кодом страны).
     *
     * @throws ValidationException
     */
    public static function assertValidFlexible(string $phone, bool $plainDigits): void
    {
        if ($plainDigits) {
            if (!self::isValidPlainBy($phone)) {
                throw ValidationException::withMessages([
                    'phone' => ['Укажите номер с кодом страны: 8–15 цифр.'],
                ]);
            }

            return;
        }
        if (!preg_match(self::REGEX, $phone)) {
            throw ValidationException::withMessages([
                'phone' => ['Номер укажите в формате мобильного +375 (25/29/33/44) XXX-XX-XX.'],
            ]);
        }
    }
}
