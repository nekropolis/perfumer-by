<?php

namespace Modules\Settings\Support;

use Carbon\Carbon;
use Carbon\CarbonInterface;

final class WaitingDiscountDeliveryDate
{
    public const SETTING_KEY = 'waiting_discount_delivery_date';

    public const DEFAULT = '10.07.2026';

    public const TIMEZONE = 'Europe/Minsk';

    /**
     * Если дата в прошлом относительно «сегодня» (Europe/Minsk), вернуть сдвиг на +7 дней от сегодня.
     *
     * @return array{from: string, to: string}|null null — менять не нужно
     */
    public static function nextIfPast(string $currentDisplayDate, ?CarbonInterface $now = null): ?array
    {
        $today = ($now ?? Carbon::now(self::TIMEZONE))
            ->copy()
            ->timezone(self::TIMEZONE)
            ->startOfDay();

        $parsed = self::parseDisplayDate($currentDisplayDate);
        if ($parsed === null) {
            return null;
        }

        if ($parsed->gte($today)) {
            return null;
        }

        return [
            'from' => $parsed->format('d.m.Y'),
            'to' => $today->copy()->addDays(7)->format('d.m.Y'),
        ];
    }

    public static function parseDisplayDate(string $displayDate): ?Carbon
    {
        $trimmed = trim($displayDate);
        if (! preg_match('/^(\d{2})\.(\d{2})\.(\d{4})$/', $trimmed, $match)) {
            return null;
        }

        $day = (int) $match[1];
        $month = (int) $match[2];
        $year = (int) $match[3];

        if (! checkdate($month, $day, $year)) {
            return null;
        }

        return Carbon::create($year, $month, $day, 0, 0, 0, self::TIMEZONE)->startOfDay();
    }
}
