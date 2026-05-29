<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;
use PHPUnit\Framework\TestCase;

class VanilleBrandParserTest extends TestCase
{
    public function test_cookie_policy_slug_is_excluded(): void
    {
        $this->assertTrue(VanilleBrandParser::isExcludedListingSlug('cookie-policy'));
        $this->assertFalse(VanilleBrandParser::isValidBrandSlug('cookie-policy'));
    }

    public function test_cookie_policy_name_is_excluded(): void
    {
        $this->assertTrue(VanilleBrandParser::isExcludedBrandName('Политикой обработки файлов cookie'));
    }

    public function test_valid_brand_slug(): void
    {
        $this->assertTrue(VanilleBrandParser::isValidBrandSlug('dolce-i-gabbana'));
    }

    public function test_invalid_asset_slug(): void
    {
        $this->assertFalse(VanilleBrandParser::isValidBrandSlug('favicon.ico'));
        $this->assertFalse(VanilleBrandParser::isValidBrandSlug('tel:5393030'));
    }

    public function test_probniki_category_is_garbage_brand(): void
    {
        $this->assertTrue(VanilleBrandParser::isGarbageBrandRow('Пробники', 'probniki', 'https://vanille.by/probniki'));
        $this->assertTrue(VanilleBrandParser::isGarbageBrandRow('Парфюмерная вода', 'parfum', 'https://vanille.by/duxi'));
    }

    public function test_country_category_brands_are_garbage(): void
    {
        $this->assertTrue(VanilleBrandParser::isGarbageBrandRow('Английские', 'angliyskie', ''));
        $this->assertTrue(VanilleBrandParser::isGarbageBrandRow('Испанские', 'ispanskie', ''));
        $this->assertTrue(VanilleBrandParser::isGarbageBrandRow('Французские', 'franczuzskie', ''));
        $this->assertTrue(VanilleBrandParser::isExcludedListingSlug('amerikanskie'));
    }

    public function test_filter_excluded_listing_rows_removes_categories(): void
    {
        $rows = VanilleBrandParser::filterExcludedListingRows([
            ['name' => 'Dolce & Gabbana', 'slug' => 'dolce-i-gabbana'],
            ['name' => 'Пробники', 'slug' => 'probniki'],
            ['name' => 'Парфюмерная вода', 'slug' => 'tualetnaya-voda'],
        ]);

        $this->assertCount(1, $rows);
        $this->assertSame('dolce-i-gabbana', $rows[0]['slug']);
    }

    public function test_filter_excluded_listing_rows_removes_cookie_policy(): void
    {
        $rows = VanilleBrandParser::filterExcludedListingRows([
            [
                'name' => 'Dolce & Gabbana',
                'slug' => 'dolce-i-gabbana',
            ],
            [
                'name' => 'Политикой обработки файлов cookie',
                'slug' => 'cookie-policy',
            ],
        ]);

        $this->assertCount(1, $rows);
        $this->assertSame('dolce-i-gabbana', $rows[0]['slug']);
    }
}
