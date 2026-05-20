<?php

namespace Tests\Unit;

use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Support\ProductImagePathResolver;
use PHPUnit\Framework\TestCase;

class ProductImagePathResolverTest extends TestCase
{
    public function test_resolve_prefers_variant_columns_when_present(): void
    {
        $image = new ProductImage([
            'path' => 'storage/products/1/legacy.webp',
            'path_full' => 'storage/products/1/foo-full.webp',
            'path_card' => 'storage/products/1/foo-card.webp',
            'path_listing' => 'storage/products/1/foo-listing.webp',
            'path_thumb' => 'storage/products/1/foo-thumb.webp',
        ]);

        $this->assertSame('storage/products/1/foo-listing.webp', ProductImagePathResolver::resolve($image, 'listing'));
        $this->assertSame('storage/products/1/foo-card.webp', ProductImagePathResolver::resolve($image, 'card'));
        $this->assertSame('storage/products/1/foo-thumb.webp', ProductImagePathResolver::resolve($image, 'thumb'));
        $this->assertSame('storage/products/1/foo-full.webp', ProductImagePathResolver::resolve($image, 'full'));
    }

    public function test_resolve_thumb_falls_back_to_listing_then_path(): void
    {
        $image = new ProductImage([
            'path' => 'storage/products/1/legacy.webp',
            'path_listing' => 'storage/products/1/foo-listing.webp',
        ]);

        $this->assertSame('storage/products/1/foo-listing.webp', ProductImagePathResolver::resolve($image, 'thumb'));

        $image->path_listing = null;
        $this->assertSame('storage/products/1/legacy.webp', ProductImagePathResolver::resolve($image, 'thumb'));
    }
}
