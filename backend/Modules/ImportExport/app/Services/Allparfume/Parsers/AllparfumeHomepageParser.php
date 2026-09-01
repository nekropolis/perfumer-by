<?php

namespace Modules\ImportExport\Services\Allparfume\Parsers;

final class AllparfumeHomepageParser
{
    /**
     * Дата из строки «Обновление цен: 25.08.2026 [N дней назад]».
     *
     * @return string|null Y-m-d
     */
    public function parsePricesUpdatedOn(string $html): ?string
    {
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;

        if (! preg_match('/Обновление цен:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/u', $text, $match)) {
            return null;
        }

        $day = (int) $match[1];
        $month = (int) $match[2];
        $year = (int) $match[3];
        if (! checkdate($month, $day, $year)) {
            return null;
        }

        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }
}
