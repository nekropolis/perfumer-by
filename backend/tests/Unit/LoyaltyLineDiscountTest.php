<?php

namespace Tests\Unit;

use Modules\Loyalty\Support\LoyaltyLineDiscount;
use PHPUnit\Framework\TestCase;

class LoyaltyLineDiscountTest extends TestCase
{
    public function test_single_price_applies_full_card_percent(): void
    {
        // Нет old_price → D=0 → 7% от 100 = 7.00
        $this->assertSame('7.00', LoyaltyLineDiscount::unitAmount('100.00', null, 7.0));
        $this->assertSame('7.00', LoyaltyLineDiscount::unitAmount('100.00', '100.00', 7.0));
        $this->assertSame('7.00', LoyaltyLineDiscount::unitAmount('100.00', '90.00', 7.0)); // old ≤ price → D=0
    }

    public function test_card_greater_than_product_discount_adds_extra_on_sale_price(): void
    {
        // 100 → 95 (D=5%), карта 7% → доп. 2% от 95 = 1.90
        $this->assertSame('1.90', LoyaltyLineDiscount::unitAmount('95.00', '100.00', 7.0));
        $this->assertEqualsWithDelta(5.0, LoyaltyLineDiscount::productDiscountPercent('95.00', '100.00'), 0.0001);
        $this->assertEqualsWithDelta(2.0, LoyaltyLineDiscount::extraPercent('95.00', '100.00', 7.0), 0.0001);
    }

    public function test_card_less_or_equal_product_discount_gives_zero(): void
    {
        // 100 → 95 (D=5%), карта 4% → 0
        $this->assertSame('0.00', LoyaltyLineDiscount::unitAmount('95.00', '100.00', 4.0));
        $this->assertSame('0.00', LoyaltyLineDiscount::unitAmount('95.00', '100.00', 5.0));
    }

    public function test_promotion_excluded(): void
    {
        $this->assertSame('0.00', LoyaltyLineDiscount::unitAmount('100.00', null, 7.0, true));
        $this->assertSame('0.00', LoyaltyLineDiscount::unitAmount('95.00', '100.00', 7.0, true));
    }

    public function test_qty_multiplies_unit_discount(): void
    {
        // 1.90 × 3 = 5.70
        $this->assertSame('5.70', LoyaltyLineDiscount::lineAmount('95.00', '100.00', 7.0, 3));
        $this->assertSame('0.00', LoyaltyLineDiscount::lineAmount('95.00', '100.00', 7.0, 0));
        $this->assertSame('14.00', LoyaltyLineDiscount::lineAmount('100.00', null, 7.0, 2));
    }

    public function test_zero_price_or_card(): void
    {
        $this->assertSame('0.00', LoyaltyLineDiscount::unitAmount('0.00', '100.00', 7.0));
        $this->assertSame('0.00', LoyaltyLineDiscount::unitAmount('100.00', null, 0.0));
    }
}
