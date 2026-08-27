<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleLinkCollector;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleCatalogImageParser;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class VanilleLinkCollectorTest extends TestCase
{
    public function test_listing_html_collects_product_links_from_product_cut_only(): void
    {
        $html = <<<'HTML'
<a href="/favicon.ico">Icon</a>
<div class="product-cut">
  <a href="/dolce-i-gabbana-light-blue"><img src="/assets/images/products/1/medium/light-blue.webp"></a>
  <div class="product-cut__title"><a href="/dolce-i-gabbana-light-blue">A</a></div>
</div>
<div class="product-cut">
  <div class="product-cut__title"><a href="/dolceandgabbana-devotion-intense">B</a></div>
</div>
<div class="product-cut">
  <div class="product-cut__title"><a href="/dolce-and-gabbana-the-one">C</a></div>
</div>
<div class="product-cut">
  <div class="product-cut__title"><a href="/dolce-i-gabbana">Brand</a></div>
</div>
HTML;

        $collector = new VanilleLinkCollector(new VanilleHttpClient(), new VanilleCatalogImageParser());
        $indexed = [];
        $reached = false;

        $method = new ReflectionMethod(VanilleLinkCollector::class, 'extractProductLinksFromHtml');
        $method->setAccessible(true);

        $found = $method->invokeArgs($collector, [
            $html,
            'dolce-i-gabbana',
            'Dolce & Gabbana',
            &$indexed,
            null,
            &$reached,
            false,
        ]);

        $this->assertSame(3, $found);
        $this->assertCount(3, $indexed);
        $this->assertArrayHasKey('https://vanille.by/dolceandgabbana-devotion-intense', $indexed);
        $this->assertSame('dolce-i-gabbana', $indexed['https://vanille.by/dolceandgabbana-devotion-intense']['brand_slug']);
        $this->assertSame(
            ['https://vanille.by/assets/images/products/1/medium/light-blue.webp'],
            $indexed['https://vanille.by/dolce-i-gabbana-light-blue']['catalog_image_urls'],
        );
        $this->assertArrayNotHasKey('https://vanille.by/favicon.ico', $indexed);
    }

    public function test_listing_html_without_product_cut_uses_href_fallback(): void
    {
        $html = <<<'HTML'
<a href="/favicon.ico">Icon</a>
<a href="/dolce-i-gabbana-light-blue">A</a>
HTML;

        $collector = new VanilleLinkCollector(new VanilleHttpClient(), new VanilleCatalogImageParser());
        $indexed = [];
        $reached = false;

        $method = new ReflectionMethod(VanilleLinkCollector::class, 'extractProductLinksFromHtml');
        $method->setAccessible(true);

        $found = $method->invokeArgs($collector, [
            $html,
            'cookie-policy',
            'Cookie',
            &$indexed,
            null,
            &$reached,
            false,
        ]);

        $this->assertSame(1, $found);
        $this->assertArrayHasKey('https://vanille.by/dolce-i-gabbana-light-blue', $indexed);
    }

    public function test_legacy_html_requires_brand_slug_prefix(): void
    {
        $html = <<<'HTML'
<a href="/dolce-i-gabbana-light-blue">A</a>
<a href="/dolceandgabbana-devotion-intense">B</a>
HTML;

        $collector = new VanilleLinkCollector(new VanilleHttpClient(), new VanilleCatalogImageParser());
        $indexed = [];
        $reached = false;

        $method = new ReflectionMethod(VanilleLinkCollector::class, 'extractProductLinksFromHtml');
        $method->setAccessible(true);

        $found = $method->invokeArgs($collector, [
            $html,
            'dolce-i-gabbana',
            'Dolce & Gabbana',
            &$indexed,
            null,
            &$reached,
            true,
        ]);

        $this->assertSame(1, $found);
    }

    public function test_parse_mse2_config_from_brand_page_snippet(): void
    {
        $html = 'mse2Config = {"actionUrl":"\\/assets\\/components\\/msearch2\\/action.php","pageId":60183,"key":"abc123","start_limit":24};';

        $collector = new VanilleLinkCollector(new VanilleHttpClient(), new VanilleCatalogImageParser());
        $method = new ReflectionMethod(VanilleLinkCollector::class, 'parseMse2Config');
        $method->setAccessible(true);

        $config = $method->invoke($collector, $html);

        $this->assertIsArray($config);
        $this->assertSame(60183, $config['page_id']);
        $this->assertSame('abc123', $config['key']);
        $this->assertSame(24, $config['limit']);
        $this->assertStringContainsString('msearch2/action.php', $config['action_url']);
    }
}
