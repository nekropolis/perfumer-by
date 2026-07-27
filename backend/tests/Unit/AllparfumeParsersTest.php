<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Allparfume\Parsers\AllparfumeBrandPageParser;
use Modules\ImportExport\Services\Allparfume\Parsers\AllparfumeBrandsIndexParser;
use Modules\ImportExport\Services\Allparfume\Parsers\AllparfumeProductPageParser;
use PHPUnit\Framework\TestCase;

class AllparfumeParsersTest extends TestCase
{
    public function test_brand_page_parser_collects_product_links_for_brand_slug(): void
    {
        $html = <<<'HTML'
<div class="b-catalog-item">
  <a href="/dolce_and_gabbana/the_one_for_men_eau_de_parfum.html">
    <div class="b-catalog-item-caption">
      <span class="b-catalog-item-caption__price">The One for Men Eau de Parfum</span>
    </div>
  </a>
  <div class="b-catalog-item-buttons">
    <a href="/dolce_and_gabbana/the_one_for_men_eau_de_parfum.html">
      The One for Men Eau de Parfum<span class="dub-pr-range">&nbsp;171,00 - 656,20 руб.&nbsp;</span>
    </a>
  </div>
</div>
<div class="b-catalog-item">
  <a href="/other_brand/not_me.html">
    <div class="b-catalog-item-caption">
      <span class="b-catalog-item-caption__price">Ignore me</span>
    </div>
  </a>
</div>
HTML;

        $parser = new AllparfumeBrandPageParser();
        $result = $parser->parseBrandProducts($html, 'dolce_and_gabbana');

        $this->assertCount(1, $result);
        $this->assertSame('/dolce_and_gabbana/the_one_for_men_eau_de_parfum.html', $result[0]['url']);
        $this->assertSame('the_one_for_men_eau_de_parfum', $result[0]['external_slug']);
        $this->assertSame('The One for Men Eau de Parfum', $result[0]['title']);
        $this->assertSame('171.00', $result[0]['listing_min_price']);
        $this->assertSame('656.20', $result[0]['listing_max_price']);
    }

    public function test_brands_index_parser_collects_brand_pages_and_skips_nav(): void
    {
        $html = <<<'HTML'
<ul>
  <li><a href="/brands.html">Бренды</a></li>
  <li><a href="/shops.html">Магазины</a></li>
  <li><a href="/acqua_di_parma.html">Acqua di Parma</a></li>
  <li><a href="/dolce_and_gabbana.html">Dolce &amp; Gabbana</a></li>
  <li><a href="/alexandre_j..html">Alexandre J.</a></li>
  <li><a href="/dolce_and_gabbana/the_one.html">Product, not brand</a></li>
</ul>
HTML;

        $parser = new AllparfumeBrandsIndexParser();
        $result = $parser->parseBrandsIndex($html);

        $slugs = array_column($result, 'brand_slug');
        $this->assertSame(['acqua_di_parma', 'alexandre_j', 'dolce_and_gabbana'], $slugs);
        $this->assertSame('https://allparfume.by/alexandre_j..html', $result[1]['brand_url']);
        $this->assertSame('Dolce & Gabbana', $result[2]['brand_name']);
    }

    public function test_product_page_parser_collects_variants_and_volume_cards(): void
    {
        $html = <<<'HTML'
<html><body>
  <h1>Dolce &amp; Gabbana - The One for Men Eau de Parfum<img alt="Мужской аромат"></h1>
  <input id="parfume-id" name="parfume-id" type="hidden" value="3597">
  <form id="ajax-form-parfume">
    <div class="dub-flip-all">
      <div id="card-1" style="width:20%">
        <div class="front" title="Отливант 1 мл edp">
          <img alt="1 ml edp"/><span>1 мл edp</span>
        </div>
      </div>
      <div id="card-2" style="width:20%">
        <div class="front" title="50 мл edp">
          <img alt="50 ml edp"/><span>50 мл edp</span>
        </div>
      </div>
      <div id="card-3" style="width:20%">
        <div class="front" title="100 мл тестер">
          <img alt="100 ml тестер"/><span>100 мл тестер</span>
        </div>
      </div>
    </div>
  </form>
  <table class="d-price-tbl-ggl">
    <tr><th>Объем</th><th>Цена</th></tr>
    <tr>
      <td>Dolce &amp; Gabbana The One for Men Eau de Parfum <span>(50&nbsp;ml&nbsp;edp)</span></td>
      <td>171 руб.</td>
    </tr>
    <tr>
      <td>Dolce &amp; Gabbana The One for Men Eau de Parfum <span>(100&nbsp;ml&nbsp;тестер)</span></td>
      <td>189 руб.</td>
    </tr>
  </table>
</body></html>
HTML;

        $parser = new AllparfumeProductPageParser();
        $result = $parser->parseProductPage($html, 'https://allparfume.by/dolce_and_gabbana/the_one_for_men_eau_de_parfum.html');

        $this->assertSame('Dolce & Gabbana - The One for Men Eau de Parfum', $result['title']);
        $this->assertSame('Dolce & Gabbana', $result['brand_name']);
        $this->assertSame('The One for Men Eau de Parfum', $result['name']);
        $this->assertSame('male', $result['gender_label']);
        $this->assertSame('3597', $result['parfume_id']);

        $this->assertCount(2, $result['variants']);
        $this->assertSame('50 ml edp', $result['variants'][0]['raw_label']);
        $this->assertSame('50.0', $result['variants'][0]['volume_ml']);
        $this->assertSame('edp', $result['variants'][0]['concentration_code']);
        $this->assertFalse($result['variants'][0]['is_tester']);
        $this->assertSame('171.00', $result['variants'][0]['min_price']);

        $this->assertSame('100 ml тестер', $result['variants'][1]['raw_label']);
        $this->assertTrue($result['variants'][1]['is_tester']);
        $this->assertSame('189.00', $result['variants'][1]['min_price']);

        $this->assertCount(3, $result['volume_cards']);
        $this->assertSame('1 ml edp', $result['volume_cards'][0]['card_click']);
        $this->assertSame('50 ml edp', $result['volume_cards'][1]['card_click']);
        $this->assertSame('100 ml тестер', $result['volume_cards'][2]['card_click']);
        $this->assertTrue($result['volume_cards'][0]['is_vial']);
        $this->assertSame($result['variants'][0]['variant_key'], $result['volume_cards'][1]['variant_key']);
        $this->assertSame($result['variants'][1]['variant_key'], $result['volume_cards'][2]['variant_key']);
    }

    public function test_shop_offers_fragment_parser_binds_shop_name_and_price(): void
    {
        $html = <<<'HTML'
<div id="result" style="height:auto">
  <table class="shopping-cart-table" style="margin:0">
    <tr>
      <td class="sct-image">
        <span class="tbl-price">171,00 руб.</span>
        <span class="delivery">Бесплатная доставка по Минску</span>
      </td>
      <td class="d-shop-tbl">
        <a href="/shops/libre.by.html">shop</a>
      </td>
      <td class="tbl-buy-btn">Libre.by<span class="d-br"></span><a target="_blank" class="out_link" href="/out.php?l=abc">Купить</a></td>
    </tr>
  </table>
</div>
HTML;

        $parser = new AllparfumeProductPageParser();
        $offers = $parser->parseShopOffersFromHtml(
            $html,
            'https://allparfume.by/dolce_and_gabbana/the_one_for_men_eau_de_parfum.html'
        );

        $this->assertCount(1, $offers);
        $this->assertSame('libre-by', $offers[0]['shop_key']);
        $this->assertSame('Libre.by', $offers[0]['shop_name']);
        $this->assertSame('171.00', $offers[0]['price']);
        $this->assertSame('Бесплатная доставка по Минску', $offers[0]['delivery_text']);
        $this->assertSame('https://allparfume.by/out.php?l=abc', $offers[0]['offer_url']);
    }
}
