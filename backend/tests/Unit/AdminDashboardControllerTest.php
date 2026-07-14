<?php

namespace Tests\Unit;

use Carbon\CarbonImmutable;
use Modules\Checkout\Http\Controllers\Api\AdminDashboardController;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\TestCase;

class AdminDashboardControllerTest extends TestCase
{
    #[DataProvider('timelineLabelProvider')]
    public function test_build_timeline_series_uses_russian_month_short_labels_without_intl(
        string $bucketStep,
        string $expectedLabel
    ): void {
        $controller = new AdminDashboardController();
        $method = new ReflectionMethod($controller, 'buildTimelineSeries');
        $method->setAccessible(true);

        $dateFrom = CarbonImmutable::parse('2026-03-01');
        $dateTo = CarbonImmutable::parse('2026-03-31');

        [$labels] = $method->invoke(
            $controller,
            $dateFrom,
            $dateTo,
            $bucketStep,
            [],
            [],
            [],
        );

        $this->assertSame($expectedLabel, $labels[0] ?? null);
    }

    public static function timelineLabelProvider(): array
    {
        return [
            'daily bucket' => ['1 day', '01.03'],
            'monthly bucket' => ['1 month', 'мар'],
        ];
    }
}
