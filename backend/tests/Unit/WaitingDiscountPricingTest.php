<?php

namespace Tests\Unit;

use Modules\Catalog\Support\WaitingDiscountPricing;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class WaitingDiscountPricingTest extends TestCase
{
    #[DataProvider('applyRoundingProvider')]
    public function test_apply_rounds_to_tenths_by_hundredths_digit(float $price, float $expected): void
    {
        self::assertSame($expected, WaitingDiscountPricing::apply($price));
    }

    public static function applyRoundingProvider(): array
    {
        return [
            'hundredths >= 5 rounds tenths up' => [106.061856, 102.9],
            'hundredths < 5 keeps tenths down' => [106.0, 102.8],
            'discount then round' => [106.06, 102.9],
            'zero price' => [0.0, 0.0],
        ];
    }
}
