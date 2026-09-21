<?php

namespace Tests\Unit;

use Modules\Checkout\Services\Dashboard\OrderSaleContributionCalculator;
use PHPUnit\Framework\TestCase;

class OrderSaleContributionCalculatorTest extends TestCase
{
    public function test_line_revenue_is_total_when_no_discount(): void
    {
        $calc = new OrderSaleContributionCalculator();
        $result = $calc->fromPayload('0.00', '5.00', [
            $this->item(['total' => '100.00', 'qty' => 2, 'supplier_purchase_price' => '40.00']),
        ]);

        $this->assertSame('5.00', $result['delivery_expense']);
        $this->assertCount(1, $result['lines']);
        $this->assertSame('100.00', $result['lines'][0]['revenue']);
        $this->assertSame('80.00', $result['lines'][0]['cost']);
        $this->assertSame(2, $result['lines'][0]['qty']);
    }

    public function test_loyalty_discount_is_split_and_last_line_gets_remainder(): void
    {
        $calc = new OrderSaleContributionCalculator();
        $result = $calc->fromPayload('10.00', '0.00', [
            $this->item(['product_id' => 1, 'total' => '30.00', 'qty' => 1, 'supplier_purchase_price' => '10.00']),
            $this->item(['product_id' => 2, 'total' => '70.00', 'qty' => 1, 'supplier_purchase_price' => '20.00']),
        ]);

        $this->assertSame('27.00', $result['lines'][0]['revenue']);
        $this->assertSame('63.00', $result['lines'][1]['revenue']);
        $this->assertSame(
            '90.00',
            bcadd($result['lines'][0]['revenue'], $result['lines'][1]['revenue'], 2),
        );
    }

    public function test_lot_price_overrides_purchase_price_for_allocated_qty(): void
    {
        $calc = new OrderSaleContributionCalculator();
        $result = $calc->fromPayload('0.00', '0.00', [
            $this->item([
                'qty' => 3,
                'total' => '90.00',
                'supplier_purchase_price' => '10.00',
                'stock_lot_allocations' => [
                    ['lot_id' => 5, 'qty' => 2],
                ],
            ]),
        ], [5 => '7.50']);

        $this->assertSame('25.00', $result['lines'][0]['cost']);
    }

    public function test_allocation_embedded_price_is_used_when_lot_is_gone(): void
    {
        $calc = new OrderSaleContributionCalculator();
        $result = $calc->fromPayload('0.00', '0.00', [
            $this->item([
                'qty' => 1,
                'total' => '150.00',
                'supplier_purchase_price' => null,
                'stock_lot_allocations' => [
                    ['lot_id' => 1336, 'qty' => 1, 'price' => '26.30'],
                ],
            ]),
        ]);

        $this->assertSame('26.30', $result['lines'][0]['cost']);
    }

    public function test_ue_to_byn_multiplies_by_rate(): void
    {
        $this->assertSame('108.80', OrderSaleContributionCalculator::ueToByn('34.00', '3.20'));
        $this->assertSame('34.00', OrderSaleContributionCalculator::ueToByn('34.00', '0'));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function item(array $overrides): array
    {
        return array_merge([
            'product_id' => 1,
            'variant_id' => 10,
            'product_name' => 'Test',
            'product_slug' => 'test',
            'variant_title' => '50 ml',
            'qty' => 1,
            'total' => '10.00',
            'supplier_purchase_price' => null,
            'stock_lot_allocations' => null,
        ], $overrides);
    }
}
