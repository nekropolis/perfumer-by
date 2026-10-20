<?php

namespace Modules\BatchCode\Services;

use Illuminate\Support\Carbon;

class BatchCodeDecoder
{
    public const TYPES = [
        'lvmh_year_month',
        'euroitalia_year_prefix',
        'el_3char',
        'loreal_luxe_year_letter',
        'format_only',
        'manufacturer_portal',
    ];

    /**
     * @param  array<string, mixed>  $rule
     * @return array{status: string, result: array<string, mixed>|null}
     */
    public function decode(string $code, array $rule): array
    {
        $decoder = $rule['decoder'];
        $type = $decoder['type'];
        $params = $decoder['params'];

        return match ($type) {
            'lvmh_year_month' => $this->lvmh($code, $params),
            'euroitalia_year_prefix' => $this->euroitalia($code, $params),
            'el_3char' => $this->elThreeChar($code, $params),
            'loreal_luxe_year_letter' => $this->loreal($code, $params),
            'format_only' => $this->withhold('format_recognized'),
            'manufacturer_portal' => $this->withhold('manufacturer_portal'),
            default => throw new \InvalidArgumentException('Unknown batch-code decoder: '.$type),
        };
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{status: string, result: array<string, mixed>|null}
     */
    private function lvmh(string $code, array $params): array
    {
        $letter = $code[1];
        $digit = (int) $code[0];
        $early = (string) $params['early_alphabet'];
        $late = (string) $params['late_alphabet'];

        if (str_contains($early, $letter)) {
            $month = strpos($early, $letter) + 1;
            $windows = $params['early_windows'];
        } elseif (str_contains($late, $letter)) {
            $month = strpos($late, $letter) + 1;
            $windows = [$params['late_window']];
        } else {
            return $this->invalid();
        }

        $points = [];
        foreach ($windows as $window) {
            foreach ($this->yearsForDigit($digit, $window) as $year) {
                if ($this->monthAllowed($year, $month)) {
                    $points[] = [$year, $month];
                }
            }
        }

        return $this->monthPoints($points);
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{status: string, result: array<string, mixed>|null}
     */
    private function euroitalia(string $code, array $params): array
    {
        $currentYear = (int) now()->year;

        if (preg_match('/^\d{7}$/', $code) === 1) {
            $year = 2000 + (int) substr($code, 0, 2);
            if ($year < (int) $params['seven_digit_from']) {
                return $this->invalid();
            }
            if ($year > $currentYear) {
                return $this->withhold('format_recognized');
            }

            return $this->yearPoints([$year]);
        }

        if (preg_match('/^\d{6}$/', $code) === 1) {
            $digit = (int) $code[0];
            foreach ($this->yearsForDigit($digit, [(int) $params['six_digit_from'], (int) $params['six_digit_to']]) as $year) {
                if ($year <= $currentYear) {
                    return $this->yearPoints([$year]);
                }
            }

            return $this->invalid();
        }

        if (preg_match('/^\d{5}[A-Z]$/', $code) === 1) {
            $digit = (int) $code[0];
            $years = [];
            foreach ($params['letter_suffix_bases'] as $base) {
                $year = (int) $base + $digit;
                if ($year >= (int) $base && $year <= (int) $base + 9 && $year <= $currentYear) {
                    $years[] = $year;
                }
            }
            if ($years === []) {
                return $this->withhold('format_recognized');
            }

            return $this->yearPoints($years);
        }

        return $this->invalid();
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{status: string, result: array<string, mixed>|null}
     */
    private function elThreeChar(string $code, array $params): array
    {
        $symbols = (string) $params['month_symbols'];
        $monthIndex = strpos($symbols, $code[1]);
        if ($monthIndex === false) {
            return $this->invalid();
        }
        $month = $monthIndex + 1;
        $digit = (int) $code[2];
        $points = [];
        foreach ($params['decade_bases'] as $base) {
            $year = (int) $base + $digit;
            if ($year < (int) $base || $year > (int) $base + 9) {
                continue;
            }
            if ($this->monthAllowed($year, $month)) {
                $points[] = [$year, $month];
            }
        }

        return $this->monthPoints($points);
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{status: string, result: array<string, mixed>|null}
     */
    private function loreal(string $code, array $params): array
    {
        $digitRegex = $params['digit_regex'] ?? null;
        if (is_string($digitRegex) && $digitRegex !== '' && preg_match('~'.$digitRegex.'~', $code) === 1) {
            $year = $params['digit_years'][$code[0]] ?? null;
            if (! is_numeric($year) || (int) $year > (int) now()->year) {
                return $this->withhold('format_recognized');
            }

            return $this->yearPoints([(int) $year]);
        }

        if (preg_match('/^\d{2}([A-Z])/', $code, $matches) !== 1) {
            return $this->invalid();
        }

        $year = $params['year_letters'][$matches[1]] ?? null;
        if (! is_numeric($year) || (int) $year > (int) now()->year) {
            return $this->withhold('format_recognized');
        }

        return $this->yearPoints([(int) $year]);
    }

    /**
     * @param  array{0: int, 1: int}  $window
     * @return list<int>
     */
    private function yearsForDigit(int $digit, array $window): array
    {
        $years = [];
        for ($year = (int) $window[0]; $year <= (int) $window[1]; $year++) {
            if ($year % 10 === $digit) {
                $years[] = $year;
            }
        }

        return $years;
    }

    private function monthAllowed(int $year, int $month): bool
    {
        $candidate = Carbon::create($year, $month, 1, 0, 0, 0);
        if (! $candidate instanceof Carbon) {
            return false;
        }

        return $candidate->startOfMonth()->lessThanOrEqualTo(now()->copy()->startOfMonth());
    }

    /**
     * @param  list<array{0: int, 1: int}>  $points
     * @return array{status: string, result: array<string, mixed>|null}
     */
    private function monthPoints(array $points): array
    {
        if ($points === []) {
            return $this->withhold('format_recognized');
        }

        usort($points, fn (array $a, array $b): int => [$a[0], $a[1]] <=> [$b[0], $b[1]]);
        $labels = array_map(
            fn (array $point): string => sprintf('%04d-%02d', $point[0], $point[1]),
            $points,
        );

        return [
            'status' => 'approximate',
            'result' => [
                'date_from' => $labels[0],
                'date_to' => $labels[array_key_last($labels)],
                'precision' => 'month',
                'candidates' => array_values($labels),
            ],
        ];
    }

    /**
     * @param  list<int>  $years
     * @return array{status: string, result: array<string, mixed>|null}
     */
    private function yearPoints(array $years): array
    {
        $years = array_values(array_unique($years));
        sort($years);
        if ($years === []) {
            return $this->withhold('format_recognized');
        }

        $currentYear = (int) now()->year;
        $currentMonth = (int) now()->month;
        $last = $years[array_key_last($years)];
        $endMonth = $last === $currentYear ? $currentMonth : 12;

        return [
            'status' => 'approximate',
            'result' => [
                'date_from' => sprintf('%04d-01', $years[0]),
                'date_to' => sprintf('%04d-%02d', $last, $endMonth),
                'precision' => 'year',
                'candidates' => array_map(fn (int $year): string => (string) $year, $years),
            ],
        ];
    }

    /**
     * @return array{status: string, result: null}
     */
    private function withhold(string $status): array
    {
        return ['status' => $status, 'result' => null];
    }

    /**
     * @return array{status: string, result: null}
     */
    private function invalid(): array
    {
        return $this->withhold('invalid_format');
    }
}
