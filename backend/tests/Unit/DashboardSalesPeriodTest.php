<?php

namespace Tests\Unit;

use Carbon\CarbonImmutable;
use Modules\Checkout\Services\Dashboard\DashboardSalesPeriod;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class DashboardSalesPeriodTest extends TestCase
{
    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    #[DataProvider('presetProvider')]
    public function test_preset_ranges_use_minsk_calendar(string $period, string $expectedFrom): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-20 15:00:00', DashboardSalesPeriod::TIMEZONE));
        $resolver = new DashboardSalesPeriod();

        [$resolved, $from, $to] = $resolver->resolveRange($period);

        $this->assertSame($period === 'nope' ? 'month' : $period, $resolved);
        $this->assertSame($expectedFrom, $from->toDateString());
        $this->assertSame('2026-08-20', $to->toDateString());
    }

    public static function presetProvider(): array
    {
        return [
            'month' => ['month', '2026-08-01'],
            'quarter' => ['quarter', '2026-07-01'],
            'year' => ['year', '2026-01-01'],
            'invalid defaults to month' => ['nope', '2026-08-01'],
        ];
    }

    public function test_custom_range_swaps_inverted_dates(): void
    {
        $resolver = new DashboardSalesPeriod();
        [$period, $from, $to] = $resolver->resolveRange('custom', '2026-03-10', '2026-03-01');

        $this->assertSame('custom', $period);
        $this->assertSame('2026-03-01', $from->toDateString());
        $this->assertSame('2026-03-10', $to->toDateString());
    }

    public function test_custom_without_dates_falls_back_to_month(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-20 15:00:00', DashboardSalesPeriod::TIMEZONE));
        $resolver = new DashboardSalesPeriod();
        [$period, $from] = $resolver->resolveRange('custom', '', '');

        $this->assertSame('month', $period);
        $this->assertSame('2026-08-01', $from->toDateString());
    }
}
