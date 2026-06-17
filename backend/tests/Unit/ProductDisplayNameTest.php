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

    public function test_armani_diamonds_urls_have_distinct_path_slugs(): void
    {
        $paths = [
            'giorgio-armani-emporio-diamonds-for-men',
            'giorgio-armani-emporio-armani-diamonds-for-men',
            'giorgio-armani-emporio-armani-diamonds-for-men-summer-edition',
        ];

        $this->assertCount(3, array_unique($paths));
    }

    public function test_armani_diamonds_path_identity_keys_are_not_used_for_import_dedup(): void
    {
        $brand = 'giorgio-armani';
        $diamonds = ProductDisplayName::vanilleProductPathIdentityKey(
            $brand,
            'giorgio-armani-emporio-diamonds-for-men',
        );
        $armaniLine = ProductDisplayName::vanilleProductPathIdentityKey(
            $brand,
            'giorgio-armani-emporio-armani-diamonds-for-men',
        );

        $this->assertSame('emporio-diamonds-for-men', $diamonds);
        $this->assertSame($diamonds, $armaniLine);
    }

    public function test_resolve_canonical_short_name_prefers_h1_over_url_slug_words(): void
    {
        $name = ProductDisplayName::resolveCanonicalShortName(
            'Giorgio Armani',
            'giorgio-armani',
            'Giorgio Armani Emporio Diamonds for Men',
            'https://vanille.by/giorgio-armani-emporio-diamonds-for-men',
        );

        $this->assertSame('Emporio Diamonds for Men', $name);
    }

    public function test_resolve_canonical_short_name_from_kenzo_title(): void
    {
        $name = ProductDisplayName::resolveCanonicalShortName(
            'Kenzo',
            'kenzo',
            'Kenzo Tokyo By Kenzo Ryoko',
            'https://vanille.by/kenzo-tokyo-by-ryoko',
        );

        $this->assertSame('Tokyo By Ryoko', $name);
    }

    public function test_resolve_canonical_short_name_restores_casing_from_aromat_when_url_slug_is_lowercase(): void
    {
        $name = ProductDisplayName::resolveCanonicalShortName(
            'Serge Lutens',
            'serge-lutens',
            'encens et lavande',
            'https://vanille.by/encens-et-lavande',
            ['Serge Lutens Encens et Lavande'],
        );

        $this->assertSame('Encens et Lavande', $name);
    }

    public function test_resolve_canonical_short_name_prefers_h1_for_slug_without_brand_prefix(): void
    {
        $name = ProductDisplayName::resolveCanonicalShortName(
            'Serge Lutens',
            'serge-lutens',
            'Serge Lutens Encens Et Lavande',
            'https://vanille.by/encens-et-lavande',
        );

        $this->assertSame('Encens Et Lavande', $name);
    }
}
