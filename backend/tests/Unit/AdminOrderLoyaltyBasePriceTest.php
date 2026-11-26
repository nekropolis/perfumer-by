<?php

namespace Tests\Unit;

use Modules\Catalog\Support\WaitingDiscountPricing;
use Modules\Checkout\Services\AdminOrderPricingService;
use Modules\Loyalty\Support\LoyaltyLineDiscount;
use PHPUnit\Framework\TestCase;

class AdminOrderLoyaltyBasePriceTest extends TestCase
{
    public function test_card_percent_uses_price_before_waiting_discount(): void
    {
        $item = ['price' => 97, 'base_price' => 100];

        $this->assertSame(100, AdminOrderPricingService::loyaltyBasePrice($item));

        $waitingPrice = WaitingDiscountPricing::apply(100.0);
        $cardAmount = (float) LoyaltyLineDiscount::unitAmount(
            AdminOrderPricingService::loyaltyBasePrice($item),
            null,
            10.0,
        );

        $this->assertSame(97.0, $waitingPrice);
        $this->assertSame(10.0, $cardAmount);
        $this->assertSame(87.0, round($waitingPrice - $cardAmount, 2));
    }

    public function test_without_base_price_card_uses_line_price(): void
    {
        $this->assertSame(97, AdminOrderPricingService::loyaltyBasePrice(['price' => 97]));
    }
}
