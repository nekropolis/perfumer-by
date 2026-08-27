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

    public function test_parse_brendyi_product_counts_sums_unique_brand_slugs(): void
    {
        $html = <<<'HTML'
<a href="https://vanille.by/guerlain">Guerlain<span class="brend-count">305</span></a>
<a href="https://vanille.by/lattafa">Lattafa<span class="brend-count">304</span></a>
<a href="https://vanille.by/guerlain">Guerlain<span class="brend-count">305</span></a>
<a href="https://vanille.by/brendyi">Бренды<span class="brend-count">999</span></a>
HTML;

        $parser = new VanilleBrandParser(new \Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient());
        $stats = $parser->parseBrendyiProductCounts($html);

        $this->assertSame(2, $stats['unique_brands']);
        $this->assertSame(609, $stats['total_product_count']);
        $this->assertSame(914, $stats['total_including_duplicate_slugs']);
        $this->assertSame(1, $stats['duplicate_slug_entries']);
    }

    public function test_parse_strips_brend_count_from_brand_name(): void
    {
        $html = <<<'HTML'
<a href="https://vanille.by/nina-ricci">Nina Ricci<span class="brend-count">12</span></a>
<a href="https://vanille.by/tom-ford">Tom Ford<span class="brend-count">111</span></a>
<a href="https://vanille.by/montale">Montale<span class="brend-count">166</span></a>
<a href="https://vanille.by/kilian">Kilian<span class="brend-count">98</span></a>
<a href="https://vanille.by/a-lab-on-fire">A Lab on Fire<span class="brend-count">6</span></a>
<a href="https://vanille.by/apieu">A'PIEU<span class="brend-count">6</span></a>
<a href="https://vanille.by/brendyi">Бренды<span class="brend-count">999</span></a>
HTML;

        $httpClient = new class extends \Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient {
            private string $body;

            public function setBody(string $body): void
            {
                $this->body = $body;
            }

            public function fetchUrl(string $url, int $timeout = 10): string
            {
                return $this->body;
            }
        };
        $httpClient->setBody($html);

        $parser = new VanilleBrandParser($httpClient);
        $brands = $parser->parse();

        $names = array_column($brands, 'name');
        $this->assertContains('Nina Ricci', $names);
        $this->assertContains('Tom Ford', $names);
        $this->assertContains('Montale', $names);
        $this->assertContains('Kilian', $names);
        $this->assertContains("A Lab on Fire", $names);
        $this->assertContains("A'PIEU", $names);
        $this->assertNotContains('Tom Ford111', $names);
        $this->assertNotContains("A'PIEU6", $names);
        $this->assertNotContains('Бренды', $names);
    }

    public function test_christian_dior_resolves_to_dior_catalog_row(): void
    {
        VanilleBrandParser::seedCatalogBrandRowsCacheForTests([
            ['name' => 'Dior', 'slug' => 'dior', 'url' => 'https://vanille.by/dior'],
        ]);

        $row = VanilleBrandParser::findCatalogBrandRow(
            'Christian Dior',
            'https://vanille.by/dior-homme-intense',
        );

        $this->assertNotNull($row);
        $this->assertSame('dior', $row['slug']);
        $this->assertTrue(VanilleBrandParser::isAllowedImportBrand(
            'Christian Dior',
            'https://vanille.by/christian-dior-sauvage-elixir',
        ));
    }
}
