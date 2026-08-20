<?php

namespace Tests\Unit;

use Carbon\CarbonImmutable;
use Modules\Catalog\Services\ProductViewService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ProductViewServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    #[DataProvider('viewsPeriodRangeProvider')]
    public function test_views_period_range_uses_minsk_calendar_bounds(
        string $period,
        string $expectedFrom
    ): void {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-20 15:00:00', ProductViewService::TIMEZONE));

        $service = new ProductViewService();
        [$from, $to] = $service->viewsPeriodRange($period);

        $this->assertSame($expectedFrom, $from->toDateString());
        $this->assertSame('2026-08-20', $to->toDateString());
        $this->assertSame(ProductViewService::TIMEZONE, $from->timezoneName);
    }

    public static function viewsPeriodRangeProvider(): array
    {
        return [
            'day' => ['day', '2026-08-20'],
            'week starts monday' => ['week', '2026-08-17'],
            'month' => ['month', '2026-08-01'],
            'quarter' => ['quarter', '2026-07-01'],
            'year' => ['year', '2026-01-01'],
            'invalid defaults to month' => ['nope', '2026-08-01'],
        ];
    }

    public function test_resolve_views_period_defaults_to_month(): void
    {
        $service = new ProductViewService();

        $this->assertSame('week', $service->resolveViewsPeriod('week'));
        $this->assertSame('month', $service->resolveViewsPeriod(''));
    }
}
