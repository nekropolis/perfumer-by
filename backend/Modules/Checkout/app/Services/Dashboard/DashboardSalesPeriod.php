<?php

namespace Modules\Checkout\Services\Dashboard;

use Carbon\CarbonImmutable;

final class DashboardSalesPeriod
{
    public const string TIMEZONE = 'Europe/Minsk';

    /** @var list<string> */
    public const array PERIODS = ['month', 'quarter', 'year', 'custom'];

    public function resolvePeriod(string $period): string
    {
        return in_array($period, self::PERIODS, true) ? $period : 'month';
    }

    /**
     * @return array{0: string, 1: CarbonImmutable, 2: CarbonImmutable}
     */
    public function resolveRange(string $period, ?string $dateFrom = null, ?string $dateTo = null): array
    {
        $period = $this->resolvePeriod($period);
        $now = CarbonImmutable::now(self::TIMEZONE);
        $to = $now->endOfDay();

        if ($period === 'custom') {
            $fromParsed = $this->parseDate($dateFrom);
            $toParsed = $this->parseDate($dateTo);
            if ($fromParsed === null && $toParsed === null) {
                return ['month', $now->startOfMonth(), $to];
            }
            $fromDate = $fromParsed ?? $toParsed ?? $now->startOfDay();
            $toDate = $toParsed ?? $fromParsed ?? $now->startOfDay();
            if ($fromDate->greaterThan($toDate)) {
                [$fromDate, $toDate] = [$toDate, $fromDate];
            }

            return ['custom', $fromDate->startOfDay(), $toDate->endOfDay()];
        }

        $from = match ($period) {
            'year' => $now->startOfYear(),
            'quarter' => $now->startOfQuarter(),
            default => $now->startOfMonth(),
        };

        return [$period, $from, $to];
    }

    private function parseDate(?string $value): ?CarbonImmutable
    {
        $raw = trim((string) $value);
        if ($raw === '' || preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) !== 1) {
            return null;
        }

        try {
            $date = CarbonImmutable::createFromFormat('Y-m-d', $raw, self::TIMEZONE);
        } catch (\Throwable) {
            return null;
        }

        if ($date === false || $date->format('Y-m-d') !== $raw) {
            return null;
        }

        return $date;
    }
}
