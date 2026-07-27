<?php

namespace Tests\Unit;

use Modules\Catalog\Services\Pricing\AllparfumeOfferSnap;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\ImportExport\Services\Allparfume\Support\AllparfumeOwnShopFilter;
use PHPUnit\Framework\TestCase;

class PricingLogicRulesTest extends TestCase
{
    public function test_own_shop_filter_matches_perfumer_by(): void
    {
        $this->assertTrue(AllparfumeOwnShopFilter::isOwnShop([
            'shop_key' => 'perfumer-by',
            'shop_name' => 'Other',
        ]));
        $this->assertTrue(AllparfumeOwnShopFilter::isOwnShop([
            'shop_key' => 'shop-x',
            'shop_name' => 'Perfumer.by',
        ]));
        $this->assertTrue(AllparfumeOwnShopFilter::isOwnShop([
            'shop_key' => 'perfumer-by-minsk',
            'shop_name' => '',
        ]));
        $this->assertFalse(AllparfumeOwnShopFilter::isOwnShop([
            'shop_key' => 'other-shop',
            'shop_name' => 'Parfum.by',
        ]));
    }

    public function test_warehouse_blend_and_thresholds(): void
    {
        $this->assertSame('120.00', MoneyDecimal::warehouseOfferBlend('100.00', '130.00'));

        // |100-110|/110 ≈ 9.09% → ≤10%
        $this->assertLessThanOrEqual(10.0, MoneyDecimal::percentDiffAbs('100.00', '110.00', '110.00'));

        // |100-120|/120 ≈ 16.67% → >10%
        $this->assertGreaterThan(10.0, MoneyDecimal::percentDiffAbs('100.00', '120.00', '120.00'));

        // |100-140|/140 ≈ 28.57% → ≤30%
        $this->assertLessThanOrEqual(30.0, MoneyDecimal::percentDiffAbs('100.00', '140.00', '140.00'));

        // |100-150|/150 ≈ 33.33% → >30%
        $this->assertGreaterThan(30.0, MoneyDecimal::percentDiffAbs('100.00', '150.00', '150.00'));

        $this->assertSame('90.00', MoneyDecimal::percentOff('100.00', 10.0));
        $this->assertSame('87.00', MoneyDecimal::percentOff('100.00', 13.0));
    }

    public function test_allparfume_snap_below_min_uses_min(): void
    {
        $snap = AllparfumeOfferSnap::select('80.00', ['100.00', '120.00', '150.00']);
        $this->assertNotNull($snap);
        $this->assertSame(0, $snap['index']);
        $this->assertSame('100.00', $snap['price']);
        $this->assertSame('snap_min', $snap['role']);
    }

    public function test_allparfume_snap_mid_picks_first_ge_sellable(): void
    {
        $snap = AllparfumeOfferSnap::select('110.00', ['100.00', '120.00', '150.00']);
        $this->assertNotNull($snap);
        $this->assertSame(1, $snap['index']);
        $this->assertSame('120.00', $snap['price']);
        $this->assertSame('snap_offer', $snap['role']);
    }

    public function test_allparfume_snap_equal_min_is_snap_min(): void
    {
        $snap = AllparfumeOfferSnap::select('100.00', ['100.00', '120.00']);
        $this->assertNotNull($snap);
        $this->assertSame(0, $snap['index']);
        $this->assertSame('snap_min', $snap['role']);
    }

    public function test_allparfume_snap_above_all_returns_null(): void
    {
        $this->assertNull(AllparfumeOfferSnap::select('200.00', ['100.00', '120.00', '150.00']));
    }
}
