<?php

namespace Modules\ImportExport\Support;

class VanilleHelper
{
    protected static array $translitMap = [
        'а' => 'a',
        'б' => 'b',
        'в' => 'v',
        'г' => 'g',
        'д' => 'd',
        'е' => 'e',
        'ё' => 'e',
        'ж' => 'zh',
        'з' => 'z',
        'и' => 'i',
        'й' => 'y',
        'к' => 'k',
        'л' => 'l',
        'м' => 'm',
        'н' => 'n',
        'о' => 'o',
        'п' => 'p',
        'р' => 'r',
        'с' => 's',
        'т' => 't',
        'у' => 'u',
        'ф' => 'f',
        'х' => 'h',
        'ц' => 'cz',
        'ч' => 'ch',
        'ш' => 'sh',
        'щ' => 'sch',
        'ъ' => '',
        'ы' => 'y',
        'ь' => '',
        'э' => 'e',
        'ю' => 'yu',
        'я' => 'ya',
    ];

    public static function slugify(string $value): string
    {
        $value = mb_strtolower(trim($value), 'UTF-8');

        $value = strtr($value, static::$translitMap);
        $value = str_replace('&', ' and ', $value);
        $value = preg_replace('/[^a-z0-9]+/u', '-', $value);
        $value = preg_replace('/-+/u', '-', $value);

        return trim((string) $value, '-');
    }

    public static function normalizeNullableString(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }
}
