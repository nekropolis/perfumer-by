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
     * Формат Ветер / UI: +375 (29) 657-72-55
     * Если номер не BY mobile — возвращает исходную строку (trim) или +digits.
     */
    public static function formatBelarusDisplay(string $phone): string
    {
        $digits = self::normalize($phone);
        if (strlen($digits) === 12 && str_starts_with($digits, '375')) {
            $op = substr($digits, 3, 2);
            $rest = substr($digits, 5);

            return sprintf(
                '+375 (%s) %s-%s-%s',
                $op,
                substr($rest, 0, 3),
                substr($rest, 3, 2),
                substr($rest, 5, 2),
            );
        }

        $trimmed = trim($phone);
        if ($trimmed !== '') {
            return $trimmed;
        }

        return $digits !== '' ? '+'.$digits : '';
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
