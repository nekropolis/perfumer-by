<?php

namespace Tests\Unit;

use Carbon\Carbon;
use Modules\Settings\Support\WaitingDiscountDeliveryDate;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class WaitingDiscountDeliveryDateTest extends TestCase
{
    #[DataProvider('nextIfPastProvider')]
    public function test_next_if_past(
        string $current,
        string $now,
        ?array $expected
    ): void {
        $result = WaitingDiscountDeliveryDate::nextIfPast(
            $current,
            Carbon::parse($now, WaitingDiscountDeliveryDate::TIMEZONE)
        );

        self::assertSame($expected, $result);
    }

    /**
     * @return list<array{0: string, 1: string, 2: array{from: string, to: string}|null}>
     */
    public static function nextIfPastProvider(): array
    {
        return [
            'past date advances from today +7' => [
                '10.07.2026',
                '2026-07-11 00:01:00',
                ['from' => '10.07.2026', 'to' => '18.07.2026'],
            ],
            'today stays' => [
                '11.07.2026',
                '2026-07-11 12:00:00',
                null,
            ],
            'future stays' => [
                '20.07.2026',
                '2026-07-11 00:01:00',
                null,
            ],
            'very old date still jumps to today +7' => [
                '01.01.2020',
                '2026-07-11 00:01:00',
                ['from' => '01.01.2020', 'to' => '18.07.2026'],
            ],
            'invalid date ignored' => [
                'not-a-date',
                '2026-07-11 00:01:00',
                null,
            ],
        ];
    }

    public function test_parse_display_date(): void
    {
        $parsed = WaitingDiscountDeliveryDate::parseDisplayDate('10.07.2026');
        self::assertNotNull($parsed);
        self::assertSame('2026-07-10', $parsed->format('Y-m-d'));
        self::assertNull(WaitingDiscountDeliveryDate::parseDisplayDate('32.13.2026'));
    }
}
