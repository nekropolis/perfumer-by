<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

class Phone
{
    public const REGEX = '/^\+?375[\s\-\(\)]*(25|29|33|44)[\s\-\)]*\d{3}[\s\-]?\d{2}[\s\-]?\d{2}$/';

    /** Только цифры: 375 и ещё 5–14 цифр (режим «нет мобильного», без кода оператора 25/29/33/44). */
    public const REGEX_PLAIN_BY_DIGITS = '/^375\d{5,14}$/';

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
     * Мобильный формат (REGEX) или «нет мобильного» (только цифры 375 + 5–14).
     *
     * @throws ValidationException
     */
    public static function assertValidFlexible(string $phone, bool $plainDigits): void
    {
        if ($plainDigits) {
            if (!self::isValidPlainBy($phone)) {
                throw ValidationException::withMessages([
                    'phone' => ['Укажите номер: 375 и не менее 5 следующих цифр (любые цифры после 375).'],
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
