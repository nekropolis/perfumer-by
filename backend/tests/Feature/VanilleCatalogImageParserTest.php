<?php

namespace Tests\Feature;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleCatalogImageParser;
use PHPUnit\Framework\TestCase;

class VanilleCatalogImageParserTest extends TestCase
{
    public function test_parse_listing_extracts_slug_and_image(): void
    {
        $html = '<a href="/brand-x-prod-123"><img src="//cdn.example/img/preview.webp" alt="x"></a>';
        $parser = new VanilleCatalogImageParser;
        $rows = $parser->parseListing($html, 'brand-x');

        $this->assertCount(1, $rows);
        $this->assertSame('brand-x-prod-123', $rows[0]['slug']);
        $this->assertSame('https://cdn.example/img/preview.webp', $rows[0]['image_url']);
        $this->assertSame(['https://cdn.example/img/preview.webp'], $rows[0]['image_urls']);
    }

    public function test_parse_listing_filters_by_brand_slug_prefix(): void
    {
        $html = '<a href="/other-prod"><img src="/a.jpg" alt=""></a>'
            .'<a href="/acme-good"><img data-src="https://vanille.by/b.jpg" alt=""></a>';
        $parser = new VanilleCatalogImageParser;
        $rows = $parser->parseListing($html, 'acme');

        $this->assertCount(1, $rows);
        $this->assertSame('acme-good', $rows[0]['slug']);
    }

    public function test_parse_listing_extracts_up_to_two_images_from_card(): void
    {
        $html = '<a href="/stephane-humbert-lucas-777-khol-de-bahrein">'
            .'<img class="product-photo__img product-photo__img__second" src="/assets/images/products/70783/mediumwebp/stephane-humbert-lucas-777-khol-de-bahrein-2.webp">'
            .'<img class="product-photo__img lazyload" src="/assets/images/products/70783/medium/stephane-humbert-lucas-777-khol-de-bahrein-1.jpg" data-src="/assets/images/products/70783/medium/stephane-humbert-lucas-777-khol-de-bahrein-1.jpg">'
            .'</a>';
        $parser = new VanilleCatalogImageParser;
        $rows = $parser->parseListing($html, 'stephane-humbert-lucas-777');

        $this->assertCount(1, $rows);
        $this->assertCount(2, $rows[0]['image_urls']);
        $this->assertSame('https://vanille.by/assets/images/products/70783/medium/stephane-humbert-lucas-777-khol-de-bahrein-1.jpg', $rows[0]['image_urls'][0]);
        $this->assertSame('https://vanille.by/assets/images/products/70783/mediumwebp/stephane-humbert-lucas-777-khol-de-bahrein-2.webp', $rows[0]['image_urls'][1]);
        $this->assertSame($rows[0]['image_urls'][0], $rows[0]['image_url']);
    }

    public function test_max_listing_page_from_html_picks_max_query_param(): void
    {
        $html = '<div><a href="/ajmal?page=2">2</a> <a href="https://vanille.by/x?page=17">»</a></div>';
        $parser = new VanilleCatalogImageParser;
        $this->assertSame(17, $parser->maxListingPageFromHtml($html));
    }

    public function test_max_listing_page_from_html_minimum_one(): void
    {
        $parser = new VanilleCatalogImageParser;
        $this->assertSame(1, $parser->maxListingPageFromHtml('<div>no paging</div>'));
    }
}
