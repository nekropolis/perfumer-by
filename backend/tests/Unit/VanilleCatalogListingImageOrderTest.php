<?php

namespace Tests\Unit;

use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Support\VanilleCatalogListingImageOrder;
use PHPUnit\Framework\TestCase;

class VanilleCatalogListingImageOrderTest extends TestCase
{
    public function test_detects_inverted_main_and_secondary_pair(): void
    {
        $hover = new ProductImage([
            'id' => 1,
            'source_url' => 'https://vanille.by/assets/foo-2.webp',
            'is_main' => true,
            'sort_order' => 1,
        ]);
        $main = new ProductImage([
            'id' => 2,
            'source_url' => 'https://vanille.by/assets/foo-1.jpg',
            'is_main' => false,
            'sort_order' => 2,
        ]);

        $this->assertTrue(VanilleCatalogListingImageOrder::needsSwap([$hover, $main]));
    }

    public function test_skips_already_correct_order(): void
    {
        $main = new ProductImage([
            'id' => 1,
            'source_url' => 'https://vanille.by/assets/foo-1.jpg',
            'is_main' => true,
            'sort_order' => 1,
        ]);
        $hover = new ProductImage([
            'id' => 2,
            'source_url' => 'https://vanille.by/assets/foo-2.webp',
            'is_main' => false,
            'sort_order' => 2,
        ]);

        $this->assertFalse(VanilleCatalogListingImageOrder::needsSwap([$main, $hover]));
    }
}
