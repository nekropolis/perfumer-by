<?php

namespace Modules\BatchCode\Support;

class BatchCodeNormalizer
{
    /** Cyrillic letters that look like Latin, after uppercasing. */
    private const LOOKALIKES = [
        'А' => 'A',
        'В' => 'B',
        'Е' => 'E',
        'К' => 'K',
        'М' => 'M',
        'Н' => 'H',
        'О' => 'O',
        'Р' => 'P',
        'С' => 'C',
        'Т' => 'T',
        'У' => 'Y',
        'Х' => 'X',
        'І' => 'I',
    ];

    public static function normalize(string $code): string
    {
        $code = mb_strtoupper($code, 'UTF-8');
        $code = strtr($code, self::LOOKALIKES);
        $stripped = preg_replace('/[\s\-–—]+/u', '', $code);

        return is_string($stripped) ? $stripped : '';
    }
}
