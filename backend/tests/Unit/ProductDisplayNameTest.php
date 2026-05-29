<?php

namespace Tests\Unit;

use Modules\Catalog\Support\ProductDisplayName;
use PHPUnit\Framework\TestCase;

class ProductDisplayNameTest extends TestCase
{
    public function test_strip_removes_repeated_brand_from_h1(): void
    {
        $strip = ProductDisplayName::stripBrandFromName(
            'Dolce & Gabbana',
            'Dolce & Gabbana Dolce and Gabbana',
        );

        $this->assertTrue($strip['found']);
        $this->assertSame('', $strip['name']);
    }

    public function test_build_slug_avoids_doubled_brand_segment(): void
    {
        $slug = ProductDisplayName::buildSlug('dolce-and-gabbana', 'Dolce and Gabbana');

        $this->assertSame('dolce-and-gabbana', $slug);
    }

    public function test_build_slug_keeps_product_part(): void
    {
        $slug = ProductDisplayName::buildSlug('dolce-i-gabbana', 'Light Blue');

        $this->assertSame('dolce-i-gabbana-light-blue', $slug);
    }

    public function test_short_name_from_vanille_url(): void
    {
        $name = ProductDisplayName::productShortNameFromVanilleUrl(
            'https://vanille.by/dolce-i-gabbana-light-blue',
            'dolce-i-gabbana',
        );

        $this->assertSame('light blue', $name);
    }

    public function test_path_identity_key_collapses_duplicate_kenzo_slugs(): void
    {
        $a = ProductDisplayName::vanilleProductPathIdentityKey(
            'kenzo',
            'https://vanille.by/kenzo-tokyo-by-kenzo-ryoko',
        );
        $b = ProductDisplayName::vanilleProductPathIdentityKey(
            'kenzo',
            'https://vanille.by/kenzo-tokyo-by-ryoko',
        );

        $this->assertSame('tokyo-by-ryoko', $a);
        $this->assertSame($a, $b);
    }

    public function test_resolve_canonical_short_name_from_either_url(): void
    {
        $name = ProductDisplayName::resolveCanonicalShortName(
            'Kenzo',
            'kenzo',
            'Kenzo Tokyo By Kenzo Ryoko',
            'https://vanille.by/kenzo-tokyo-by-ryoko',
        );

        $this->assertSame('tokyo by ryoko', $name);
    }
}
