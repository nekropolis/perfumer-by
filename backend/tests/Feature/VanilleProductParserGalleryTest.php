<?php

namespace Tests\Feature;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleProductParser;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;
use PHPUnit\Framework\TestCase;

class VanilleProductParserGalleryTest extends TestCase
{
    public function test_parse_gallery_uses_product_photo_large_links_only(): void
    {
        $html = '<div class="product-photo hidden-xs" data-product-photo-scope="">'
            .'<a class="product-photo__item product-photo__item--lg" href="/assets/images/products/84268/largewebp/paris-hilton-with-love-1.webp">'
            .'<img class="product-photo__img" src="/assets/images/products/84268/largewebp/paris-hilton-with-love-1.webp">'
            .'<img class="product-brend__img" src="assets/images/brends/paris_hilton.png">'
            .'</a>'
            .'<ul class="product-photo__thumbs">'
            .'<li><a class="product-photo__thumb-item" href="/assets/images/products/84268/largewebp/paris-hilton-with-love-1.webp"></a></li>'
            .'<li><a class="product-photo__thumb-item" href="/assets/images/products/84268/largewebp/paris-hilton-with-love-2.webp"></a></li>'
            .'<li><a class="product-photo__thumb-item" href="/assets/images/products/84268/largewebp/paris-hilton-with-love-3.webp"></a></li>'
            .'</ul>'
            .'</div><div class="product-intro__section"></div>'
            .'<img src="/assets/images/social/facebook.png">';

        $httpClient = $this->getMockBuilder(VanilleHttpClient::class)
            ->disableOriginalConstructor()
            ->getMock();
        $parser = new VanilleProductParser($httpClient);

        $urls = $parser->parseGalleryImageUrlsFromHtml($html);

        $this->assertSame([
            'https://vanille.by/assets/images/products/84268/largewebp/paris-hilton-with-love-1.webp',
            'https://vanille.by/assets/images/products/84268/largewebp/paris-hilton-with-love-2.webp',
            'https://vanille.by/assets/images/products/84268/largewebp/paris-hilton-with-love-3.webp',
        ], $urls);
    }
}

