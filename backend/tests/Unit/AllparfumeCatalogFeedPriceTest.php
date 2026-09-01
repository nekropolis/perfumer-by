<?php

namespace Tests\Unit;

use Modules\Catalog\Support\WaitingDiscountPricing;
use Modules\ImportExport\Services\Allparfume\AllparfumeCatalogFeedService;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class AllparfumeCatalogFeedPriceTest extends TestCase
{
    public function test_offer_channels_apply_waiting_discount(): void
    {
        $discounted = WaitingDiscountPricing::apply(100.0);

        $this->assertSame($discounted, $this->price(100.0, ['availability_source' => 'supplier_only'], false));
        $this->assertSame($discounted, $this->price(100.0, ['availability_source' => 'main+supplier'], false));
    }

    public function test_main_stock_keeps_full_price(): void
    {
        $this->assertSame(100.0, $this->price(100.0, ['availability_source' => 'main'], false));
    }

    public function test_promotion_skips_waiting_discount(): void
    {
        $this->assertSame(
            100.0,
            $this->price(100.0, ['availability_source' => 'supplier_only'], true),
        );
    }

    /**
     * @param  array{availability_source?: string}  $presented
     */
    private function price(float $storefrontPrice, array $presented, bool $isPromotion): float
    {
        $method = new ReflectionMethod(AllparfumeCatalogFeedService::class, 'variantFeedPrice');

        return $method->invoke(new AllparfumeCatalogFeedService(), $storefrontPrice, $presented, $isPromotion);
    }
}
