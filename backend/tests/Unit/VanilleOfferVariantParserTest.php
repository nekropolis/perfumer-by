<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleOfferVariantParser;
use PHPUnit\Framework\TestCase;

class VanilleOfferVariantParserTest extends TestCase
{
    public function test_parses_russian_edp_from_data_tip(): void
    {
        $parser = new VanilleOfferVariantParser();

        $parsed = $parser->parseVariant([
            'variant' => '100 мл',
            'type' => 'парфюмерная вода',
            'title' => '',
        ]);

        $this->assertSame(100, $parsed['volume_ml']);
        $this->assertSame('edp', $parsed['concentration_code']);
        $this->assertFalse($parsed['is_tester']);
    }

    public function test_parses_decimal_volume_from_barcode_label(): void
    {
        $parser = new VanilleOfferVariantParser();

        $parsed = $parser->parseVariant([
            'variant' => '7.5 мл',
            'type' => 'парфюмерная вода',
            'title' => 'миниатюра',
        ]);

        $this->assertSame(8, $parsed['volume_ml']);
        $this->assertSame('edp', $parsed['concentration_code']);
    }
}
