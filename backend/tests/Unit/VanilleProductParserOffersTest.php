<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleProductParser;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;
use PHPUnit\Framework\TestCase;

class VanilleProductParserOffersTest extends TestCase
{
    public function test_merges_barcode_rows_when_only_one_offer_in_stock(): void
    {
        $html = '<div><div itemprop="offers" itemscope itemtype="https://schema.org/Offer">'
            .'<meta itemprop="price" content="392.3">'
            .'<input value="100 мл" data-tip="парфюмерная вода" data-article="3770000002331">'
            .'</div></div>'
            .'<table>'
            .'<tr><td class="barcode">7.5 мл миниатюра<br><small>парфюмерная вода</small></td><td>3770000002287</td></tr>'
            .'<tr><td class="barcode">50 мл<br><small>парфюмерная вода</small></td><td>3770000002317</td></tr>'
            .'<tr><td class="barcode">100 мл<br><small>парфюмерная вода</small></td><td>3770000002331</td></tr>'
            .'</table>'
            .'<div class="product-intro__section"></div>';

        $httpClient = $this->createMock(VanilleHttpClient::class);
        $parser = new VanilleProductParser($httpClient);

        $barcodeOffers = (new \ReflectionMethod($parser, 'parseBarcodeVolumeOffers'))
            ->invoke($parser, $html, 'парфюмерная вода');
        $schemaOffers = (new \ReflectionMethod($parser, 'parseOffers'))
            ->invoke($parser, $html, 'Juliette Has a Gun', 'Magnolia Bliss');
        $merged = (new \ReflectionMethod($parser, 'mergeOffersByVolumeKey'))
            ->invoke($parser, $schemaOffers, $barcodeOffers);

        $this->assertCount(1, $schemaOffers);
        $this->assertCount(3, $barcodeOffers);
        $this->assertCount(3, $merged);
    }
}
