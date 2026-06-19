<?php

namespace Tests\Unit;

use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class SellerOneVariantMatcherLinkTest extends TestCase
{
    public function test_should_skip_parsing_when_title_contains_triple_asterisk(): void
    {
        $matcher = new SellerOneVariantMatcher();

        $this->assertTrue($matcher->shouldSkipParsingTitle('Brand Product ***'));
        $this->assertTrue($matcher->shouldSkipParsingRow([
            'code' => '1',
            'title' => 'Brand Product *** special',
        ]));
        $this->assertFalse($matcher->shouldSkipParsingTitle('Brand Product **'));
        $this->assertFalse($matcher->shouldSkipParsingTitle('Brand Product * * *'));
    }

    public function test_split_name_keeps_gender_markers_in_name_part(): void
    {
        $matcher = new SellerOneVariantMatcher();

        $split = $matcher->splitNameAndVariantTail('Brand Line (U) 100ml edp');
        $this->assertSame('Brand Line (U)', $split['name']);
        $this->assertSame('100ml edp', $split['tail']);

        $extract = new ReflectionMethod($matcher, 'extractGenderMarker');
        $extract->setAccessible(true);
        $this->assertSame('u', $extract->invoke($matcher, 'Versace Crystal Noir (U) Parfum 90ml edp'));
        $this->assertSame('u', $extract->invoke($matcher, 'Versace Crystal Noir (u) Parfum 90ml edp'));
        $this->assertSame('l', $extract->invoke($matcher, 'Versace Crystal Noir (L) Parfum 90ml edp'));
        $this->assertSame('m', $extract->invoke($matcher, 'Versace Crystal Noir (M) Parfum 90ml edp'));
    }

    public function test_extract_base_product_name_keeps_inline_brand_word(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'extractBaseProductName');
        $method->setAccessible(true);

        $this->assertSame(
            'Eau De Iceberg Sensual Musk',
            $method->invoke($matcher, 'Iceberg Eau De Iceberg Sensual Musk(L)', 'Iceberg'),
        );
    }

    public function test_extract_base_product_name_strips_gender_markers(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'extractBaseProductName');
        $method->setAccessible(true);

        $this->assertSame(
            'Crystal Noir Parfum',
            $method->invoke($matcher, 'Versace Crystal Noir (U) Parfum', 'Versace'),
        );
    }

    public function test_inline_brand_word_prevents_exact_name_token_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $extract = new ReflectionMethod($matcher, 'extractBaseProductName');
        $extract->setAccessible(true);
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $supplierBase = $extract->invoke(
            $matcher,
            'Iceberg Eau De Iceberg Sensual Musk(L)',
            'Iceberg',
        );
        $supplier = $tokens->invoke($matcher, $supplierBase, 'Iceberg');
        $catalog = $tokens->invoke($matcher, 'Eau de Sensual Musk', 'Iceberg');

        $this->assertSame(['eau', 'de', 'iceberg', 'sensual', 'musk'], $supplier);
        $this->assertSame(['eau', 'de', 'sensual', 'musk'], $catalog);
        $this->assertNotSame($supplier, $catalog);
    }

    public function test_skipped_inline_brand_token_allows_partial_product_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'supplierMatchesCatalogWithSkippedInlineBrandToken');
        $method->setAccessible(true);

        $this->assertTrue($method->invoke(
            $matcher,
            ['eau', 'de', 'iceberg', 'sensual', 'musk'],
            ['eau', 'de', 'sensual', 'musk'],
            'Iceberg',
        ));
        $this->assertFalse($method->invoke(
            $matcher,
            ['eau', 'de', 'iceberg', 'wild', 'rose'],
            ['eau', 'de', 'sensual', 'musk'],
            'Iceberg',
        ));
        $this->assertFalse($method->invoke(
            $matcher,
            ['eau', 'de', 'sensual', 'musk', 'intense'],
            ['eau', 'de', 'sensual', 'musk'],
            'Iceberg',
        ));
    }

    public function test_split_name_before_test_or_ml_or_extrait(): void
    {
        $matcher = new SellerOneVariantMatcher();

        $a = $matcher->splitNameAndVariantTail('Zarkoperfume Carate Urio test 100 ml edp');
        $this->assertSame('Zarkoperfume Carate Urio', $a['name']);
        $this->assertSame('test 100 ml edp', $a['tail']);

        $b = $matcher->splitNameAndVariantTail('Zarkoperfume Carate Urio 100ml edp');
        $this->assertSame('Zarkoperfume Carate Urio', $b['name']);
        $this->assertSame('100ml edp', $b['tail']);

        $c = $matcher->splitNameAndVariantTail('Brand Line 50ml Extrait De Parfum');
        $this->assertSame('Brand Line', $c['name']);
        $this->assertSame('50ml Extrait De Parfum', $c['tail']);

        $d = $matcher->splitNameAndVariantTail('Histoires de Parfums Tubereuse Nuit Blanche vial 2ml edp');
        $this->assertSame('Histoires de Parfums Tubereuse Nuit Blanche', $d['name']);
        $this->assertSame('vial 2ml edp', $d['tail']);

        $e = $matcher->splitNameAndVariantTail('Carolina Herrera Bad Boy s/g 100ml');
        $this->assertSame('Carolina Herrera Bad Boy s/g', $e['name']);
        $this->assertSame('100ml', $e['tail']);

        $f = $matcher->splitNameAndVariantTail('Carolina Herrera Bad Boy edp 100ml');
        $this->assertSame('Carolina Herrera Bad Boy', $f['name']);
        $this->assertSame('edp 100ml', $f['tail']);
    }

    public function test_parse_variant_tail_detects_extra_words(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'parseVariantTailSignature');
        $method->setAccessible(true);

        $sig = $method->invoke($matcher, '90ml edp test с крышкой');

        $this->assertSame(90.0, $sig['volume']);
        $this->assertSame('edp', $sig['concentration']);
        $this->assertTrue($sig['is_tester']);
        $this->assertSame(['крышкой'], $sig['extra_tokens']);
    }

    public function test_generic_extra_words_in_tail_score_variant_extra(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $parse = new ReflectionMethod($matcher, 'parseVariantTailSignature');
        $parse->setAccessible(true);
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        foreach (['set', 'viak'] as $extraWord) {
            $tail = "2ml edp {$extraWord}";
            $sig = $parse->invoke($matcher, $tail);
            $this->assertSame(2.0, $sig['volume'], $extraWord);
            $this->assertSame('edp', $sig['concentration'], $extraWord);
            $this->assertSame([$extraWord], $sig['extra_tokens'], $extraWord);
        }

        $vialSig = $parse->invoke($matcher, '2ml edp vial');
        $this->assertSame(2.0, $vialSig['volume']);
        $this->assertSame('edp', $vialSig['concentration']);
        $this->assertTrue($vialSig['is_vial']);
        $this->assertSame([], $vialSig['extra_tokens']);

        $definition = new VariantDefinition([
            'volume_ml' => 2,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 31]);
        $variant->id = 31;
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Tubereuse Nuit Blanche', 'brand_id' => 9]);
        $product->id = 31;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, '2ml edp set');
        $this->assertSame(95, $match['total']);
        $this->assertSame('variant_extra', $match['link_match_level']);
    }

    public function test_extra_word_in_name_part_is_not_stripped_from_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $extract = new ReflectionMethod($matcher, 'extractBaseProductName');
        $extract->setAccessible(true);
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $brand = 'Histoires de Parfums';
        $supplierBase = $extract->invoke(
            $matcher,
            'Histoires de Parfums Tubereuse Nuit Blanche set',
            $brand,
        );
        $supplier = $tokens->invoke($matcher, $supplierBase, $brand);
        $catalog = $tokens->invoke($matcher, 'Tubereuse Nuit Blanche', $brand);

        $this->assertContains('set', $supplier);
        $this->assertNotContains('set', $catalog);
        $this->assertNotSame($supplier, $catalog);
    }

    public function test_vial_in_name_part_is_stripped_from_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $extract = new ReflectionMethod($matcher, 'extractBaseProductName');
        $extract->setAccessible(true);
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $brand = 'Histoires de Parfums';
        $supplierBase = $extract->invoke(
            $matcher,
            'Histoires de Parfums Tubereuse Nuit Blanche',
            $brand,
        );
        $supplier = $tokens->invoke($matcher, $supplierBase, $brand);
        $catalog = $tokens->invoke($matcher, 'Tubereuse Nuit Blanche', $brand);

        $this->assertNotContains('vial', $supplier);
        $this->assertSame($supplier, $catalog);
    }

    public function test_vial_in_tail_scores_full_match_not_variant_extra(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $definition = new VariantDefinition([
            'volume_ml' => 2,
            'concentration_code' => 'edp',
            'is_tester' => false,
            'is_vial' => true,
        ]);
        $variant = new ProductVariantLink(['product_id' => 31, 'volume' => 2, 'concentration' => 'edp']);
        $variant->id = 31;
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Tubereuse Nuit Blanche', 'brand_id' => 9]);
        $product->id = 31;
        $product->setRelation('variants', collect([$variant]));

        foreach (['vial 2ml edp', '2ml edp vial'] as $tail) {
            $match = $resolve->invoke($matcher, $product, $tail);
            $this->assertSame(100, $match['total'], $tail);
            $this->assertSame('full', $match['link_match_level'], $tail);
        }
    }

    public function test_vial_parsed_from_supplier_row(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $brands = collect([
            (object) ['id' => 1, 'name' => 'Valentino'],
        ]);
        $rules = collect();

        $row = $matcher->parseSupplierRow(
            ['code' => 'v1', 'title' => 'Valentino Donna Born In Roma Intense (L) vial 1.2 ml edp'],
            $brands,
            $rules,
            [],
        );

        $this->assertTrue($row['parsed']['is_vial']);
        $this->assertFalse($row['parsed']['is_tester']);
        $this->assertSame(1.2, $row['parsed']['volume']);
        $this->assertSame('edp', $row['parsed']['concentration']);
    }

    public function test_parfum_in_variant_tail_maps_to_extrait_de_parfum(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $parse = new ReflectionMethod($matcher, 'parseVariantTailSignature');
        $parse->setAccessible(true);
        $extract = new ReflectionMethod($matcher, 'extractConcentration');
        $extract->setAccessible(true);
        $normalize = new ReflectionMethod($matcher, 'normalizeConcentration');
        $normalize->setAccessible(true);

        foreach ([
            '50ml parfum test',
            '100ml Parfum',
            'test 100ml parfum',
        ] as $tail) {
            $sig = $parse->invoke($matcher, $tail);
            $this->assertSame('extrait de parfum', $sig['concentration'], $tail);
            $this->assertSame('extrait de parfum', $extract->invoke($matcher, $tail), $tail);
        }

        $extrait = $parse->invoke($matcher, '90ml extrait de parfum');
        $this->assertSame('extrait de parfum', $extrait['concentration']);
        $this->assertSame('parfum', $normalize->invoke($matcher, 'parfum'));
        $this->assertSame('extrait de parfum', $normalize->invoke($matcher, 'extrait de parfum'));
    }

    public function test_variant_tail_parfum_matches_extrait_catalog_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $product = $this->makeProductWithGenderOption(991, 73, 'Graduate 1954', 438, 9911, 50, 'extrait de parfum', true);

        $match = $find->invoke(
            $matcher,
            73,
            'Roads',
            'Graduate 1954',
            '50ml parfum test',
            50.0,
            'extrait de parfum',
            true,
            [73 => [$product]],
            null,
            'Graduate 1954',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(991, $match['product']->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_trailing_parfume_in_line_name_strips_product_and_infers_extrait(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $extract = new ReflectionMethod($matcher, 'extractBaseProductName');
        $extract->setAccessible(true);
        $apply = new ReflectionMethod($matcher, 'applyTrailingParfumeLineNameRule');
        $apply->setAccessible(true);
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $split = $matcher->splitNameAndVariantTail('House Of Sillage Holiday Parfume 75ml test');
        $this->assertSame('House Of Sillage Holiday Parfume', $split['name']);
        $this->assertSame('75ml test', $split['tail']);

        $base = $extract->invoke($matcher, $split['name'], 'House Of Sillage');
        $this->assertSame('Holiday Parfume', $base);

        [$lineName, $concentration] = $apply->invoke($matcher, $base, null);
        $this->assertSame('Holiday', $lineName);
        $this->assertSame('extrait de parfum', $concentration);

        $product = $this->makeProductWithGenderOption(981, 72, 'Holiday', 438, 9811, 75, 'extrait de parfum', true);

        $match = $find->invoke(
            $matcher,
            72,
            'House Of Sillage',
            'Holiday',
            '75ml test',
            75.0,
            'extrait de parfum',
            true,
            [72 => [$product]],
            null,
            'Holiday',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(981, $match['product']->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_trailing_parfume_rule_does_not_strip_parfumerie_or_de_parfum_lines(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $apply = new ReflectionMethod($matcher, 'applyTrailingParfumeLineNameRule');
        $apply->setAccessible(true);

        [$parfumerie, $conc1] = $apply->invoke($matcher, 'Opus Kore', null);
        $this->assertSame('Opus Kore', $parfumerie);
        $this->assertNull($conc1);

        [$deParfum, $conc2] = $apply->invoke($matcher, 'Pasha de Parfum', null);
        $this->assertSame('Pasha de Parfum', $deParfum);
        $this->assertNull($conc2);

        [$parfume, $conc3] = $apply->invoke($matcher, 'Holiday Parfume', null);
        $this->assertSame('Holiday', $parfume);
        $this->assertSame('extrait de parfum', $conc3);

        [$parfum, $conc4] = $apply->invoke($matcher, 'Melati Gaharu Parfum', null);
        $this->assertSame('Melati Gaharu', $parfum);
        $this->assertSame('extrait de parfum', $conc4);
    }

    public function test_trailing_parfum_in_line_name_matches_catalog_without_parfum_suffix(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $apply = new ReflectionMethod($matcher, 'applyTrailingParfumeLineNameRule');
        $apply->setAccessible(true);
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        [$lineName, $concentration] = $apply->invoke($matcher, 'Melati Gaharu Parfum', null);
        $this->assertSame('Melati Gaharu', $lineName);
        $this->assertSame('extrait de parfum', $concentration);

        $product = $this->makeProductWithGenderOption(1003, 74, 'Melati Gaharu', 438, 10031, 30, 'extrait de parfum');

        $match = $find->invoke(
            $matcher,
            74,
            'Hunayn',
            'Melati Gaharu',
            '30ml',
            30.0,
            'extrait de parfum',
            false,
            [74 => [$product]],
            null,
            'Melati Gaharu',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(1003, $match['product']->id);
        $this->assertSame(100, $match['total']);
    }

    public function test_trailing_parfum_line_overrides_edp_in_tail_for_variant_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $extract = new ReflectionMethod($matcher, 'extractBaseProductName');
        $extract->setAccessible(true);
        $apply = new ReflectionMethod($matcher, 'applyTrailingParfumeLineNameRule');
        $apply->setAccessible(true);
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $base = $extract->invoke($matcher, "Givenchy L'Interdit Parfum (L)", 'Givenchy');
        $this->assertSame("L'Interdit Parfum", $base);

        [$lineName, $concentration] = $apply->invoke($matcher, $base, 'edp');
        $this->assertSame("L'Interdit", $lineName);
        $this->assertSame('extrait de parfum', $concentration);

        $extraitDefinition = new VariantDefinition([
            'volume_ml' => 10,
            'concentration_code' => 'extrait de parfum',
            'is_tester' => false,
        ]);
        $extraitVariant = new ProductVariantLink(['product_id' => 1101, 'volume' => 10, 'concentration' => 'extrait de parfum']);
        $extraitVariant->id = 11011;
        $extraitVariant->setRelation('definition', $extraitDefinition);

        $edpDefinition = new VariantDefinition([
            'volume_ml' => 10,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $edpVariant = new ProductVariantLink(['product_id' => 1101, 'volume' => 10, 'concentration' => 'edp']);
        $edpVariant->id = 11012;
        $edpVariant->setRelation('definition', $edpDefinition);

        $product = $this->makeProductWithGenderOption(1101, 80, "L'Interdit", 3, 11011, 10, 'extrait de parfum');
        $product->setRelation('variants', collect([$extraitVariant, $edpVariant]));

        $variantMatch = $resolve->invoke($matcher, $product, '10ml edp', 'extrait de parfum');
        $this->assertSame(11011, $variantMatch['variant']?->id);
        $this->assertSame('full', $variantMatch['link_match_level']);

        $match = $find->invoke(
            $matcher,
            80,
            'Givenchy',
            "L'Interdit",
            '10ml edp',
            10.0,
            'extrait de parfum',
            false,
            [80 => [$product]],
            'female',
            "L'Interdit",
            'l',
        );

        $this->assertNotNull($match);
        $this->assertSame(1101, $match['product']->id);
        $this->assertSame(11011, $match['variant']?->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_trailing_parfum_line_with_tester_matches_extrait_tester_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $extract = new ReflectionMethod($matcher, 'extractBaseProductName');
        $extract->setAccessible(true);
        $apply = new ReflectionMethod($matcher, 'applyTrailingParfumeLineNameRule');
        $apply->setAccessible(true);
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $base = $extract->invoke($matcher, "Givenchy L'Interdit Parfum (L)", 'Givenchy');
        [$lineName, $concentration] = $apply->invoke($matcher, $base, null);
        $this->assertSame("L'Interdit", $lineName);
        $this->assertSame('extrait de parfum', $concentration);

        $product = $this->makeProductWithGenderOption(1102, 80, "L'Interdit", 3, 11021, 80, 'extrait de parfum', true);

        $match = $find->invoke(
            $matcher,
            80,
            'Givenchy',
            "L'Interdit",
            'test 80ml',
            80.0,
            'extrait de parfum',
            true,
            [80 => [$product]],
            'female',
            "L'Interdit",
            'l',
        );

        $this->assertNotNull($match);
        $this->assertSame(1102, $match['product']->id);
        $this->assertSame(11021, $match['variant']?->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_full_match_links_at_100_percent(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $definition = new VariantDefinition([
            'volume_ml' => 100,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 21]);
        $variant->id = 11;
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Carate Urio', 'brand_id' => 7]);
        $product->id = 21;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, '100 ml edp');

        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
        $this->assertSame(11, $match['variant']?->id);
    }

    public function test_duplicate_volume_in_tail_still_scores_full_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $parse = new ReflectionMethod($matcher, 'parseVariantTailSignature');
        $parse->setAccessible(true);
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $sig = $parse->invoke($matcher, '100ml Extrait de Parfum 100ml');
        $this->assertSame(100.0, $sig['volume']);
        $this->assertSame('extrait de parfum', $sig['concentration']);
        $this->assertSame([], $sig['extra_tokens']);

        $definition = new VariantDefinition([
            'volume_ml' => 100,
            'concentration_code' => 'extrait de parfum',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 41]);
        $variant->id = 41;
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Cianuro', 'brand_id' => 17]);
        $product->id = 41;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, '100ml Extrait de Parfum 100ml');
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
        $this->assertSame(41, $match['variant']?->id);
    }

    public function test_v_canto_cianuro_name_tokens_with_brand_prefix(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $split = $matcher->splitNameAndVariantTail('V Canto Cianuro 100ml Extrait de Parfum 100ml');
        $this->assertSame('V Canto Cianuro', $split['name']);

        $extract = new ReflectionMethod($matcher, 'extractBaseProductName');
        $extract->setAccessible(true);
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $supplier = $tokens->invoke(
            $matcher,
            $extract->invoke($matcher, $split['name'], 'V Canto'),
            'V Canto',
        );
        $catalog = $tokens->invoke($matcher, 'Cianuro', 'V Canto');

        $this->assertSame(['cianuro'], $supplier);
        $this->assertSame($supplier, $catalog);
    }

    public function test_variant_extra_scores_95_without_full_link_level(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $definition = new VariantDefinition([
            'volume_ml' => 90,
            'concentration_code' => 'edp',
            'is_tester' => true,
        ]);
        $variant = new ProductVariantLink(['product_id' => 22]);
        $variant->id = 12;
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Crystal Noir Parfum', 'brand_id' => 8]);
        $product->id = 22;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, '90ml edp test с крышкой');

        $this->assertSame(95, $match['total']);
        $this->assertSame('variant_extra', $match['link_match_level']);
        $this->assertSame(12, $match['variant']?->id);
    }

    public function test_name_only_scores_90_when_variant_mismatch(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $definition = new VariantDefinition([
            'volume_ml' => 50,
            'concentration_code' => 'edt',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 23]);
        $variant->id = 13;
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Crystal Noir Parfum', 'brand_id' => 8]);
        $product->id = 23;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, '90ml edp test');

        $this->assertNull($match['variant']);
        $this->assertSame(90, $match['total']);
        $this->assertSame('name_only', $match['link_match_level']);
    }

    public function test_extract_volume_supports_decimal_with_dot_and_comma(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $extract = new ReflectionMethod($matcher, 'extractVolume');
        $extract->setAccessible(true);

        $this->assertSame(1.5, $extract->invoke($matcher, '1.5ml edp vial'));
        $this->assertSame(1.5, $extract->invoke($matcher, '1,5 ml edp vial'));
        $this->assertSame(1.2, $extract->invoke($matcher, '1.2ml edp vial'));
    }

    public function test_fractional_volumes_do_not_match_nearest_integer_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $core = new ReflectionMethod($matcher, 'coreVariantFieldsMatch');
        $core->setAccessible(true);

        $supplier15 = ['volume' => 1.5, 'concentration' => 'edp', 'is_tester' => false, 'extra_tokens' => []];
        $supplier12 = ['volume' => 1.2, 'concentration' => 'edp', 'is_tester' => false, 'extra_tokens' => []];
        $catalog2 = ['volume' => 2.0, 'concentration' => 'edp', 'is_tester' => false];
        $catalog1 = ['volume' => 1.0, 'concentration' => 'edp', 'is_tester' => false];

        $this->assertFalse($core->invoke($matcher, $supplier15, $catalog2));
        $this->assertFalse($core->invoke($matcher, $supplier12, $catalog1));
    }

    public function test_volume_only_supplier_does_not_match_catalog_with_concentration(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $core = new ReflectionMethod($matcher, 'coreVariantFieldsMatch');
        $core->setAccessible(true);

        $supplierVolumeOnly = [
            'volume' => 100.0,
            'concentration' => null,
            'is_tester' => false,
            'extra_tokens' => [],
        ];
        $catalogEdp = ['volume' => 100.0, 'concentration' => 'edp', 'is_tester' => false];
        $catalogNoConc = ['volume' => 100.0, 'concentration' => null, 'is_tester' => false];

        $this->assertFalse($core->invoke($matcher, $supplierVolumeOnly, $catalogEdp));
        $this->assertTrue($core->invoke($matcher, $supplierVolumeOnly, $catalogNoConc));
    }

    public function test_volume_only_tail_does_not_full_match_edp_catalog_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $definition = new VariantDefinition([
            'volume_ml' => 100,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 901]);
        $variant->id = 9011;
        $variant->volume = 100;
        $variant->concentration = 'edp';
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Dar Al Hae', 'brand_id' => 44]);
        $product->id = 901;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, '100ML');
        $this->assertNull($match['variant']);
        $this->assertSame(90, $match['total']);
        $this->assertSame('name_only', $match['link_match_level']);
    }

    public function test_extrait_in_product_line_name_is_preserved_in_match_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $withExtrait = $tokens->invoke($matcher, 'Rouge Smoking Extrait', 'BDK Parfums');
        $withoutExtrait = $tokens->invoke($matcher, 'Rouge Smoking', 'BDK Parfums');

        $this->assertContains('extrait', $withExtrait);
        $this->assertNotContains('extrait', $withoutExtrait);
    }

    public function test_shower_gel_marker_in_product_name_is_preserved_in_match_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $withSg = $tokens->invoke($matcher, 'Bad Boy s/g', 'Carolina Herrera');
        $withoutSg = $tokens->invoke($matcher, 'Bad Boy', 'Carolina Herrera');

        $this->assertContains('linesg', $withSg);
        $this->assertNotContains('linesg', $withoutSg);
    }

    public function test_bad_boy_shower_gel_does_not_match_fragrance_product(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $fragrance = $this->makeProductWithGenderOption(801, 30, 'Bad Boy', 2, 8011, 100, 'edt');
        $showerGel = $this->makeProductWithGenderOption(802, 30, 'Bad Boy s/g', 2, 8021, 100, '');

        $match = $find->invoke(
            $matcher,
            30,
            'Carolina Herrera',
            'Bad Boy s/g',
            '100ml',
            100.0,
            null,
            false,
            [30 => [$fragrance, $showerGel]],
            null,
            'Bad Boy s/g',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(802, $match['product']->id);
    }

    public function test_la_line_marker_in_product_name_is_preserved_in_match_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $withLa = $tokens->invoke($matcher, 'L.A. Glow', 'Jennifer Lopez');
        $withoutLa = $tokens->invoke($matcher, 'glow', 'Jennifer Lopez');

        $this->assertContains('linela', $withLa);
        $this->assertNotContains('linela', $withoutLa);
        $this->assertContains('glow', $withLa);
    }

    public function test_la_glow_does_not_match_plain_glow_product(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $plainGlow = $this->makeProductWithGenderOption(971, 80, 'glow', 3, 9711, 100, 'edt', true);
        $laGlow = $this->makeProductWithGenderOption(972, 80, 'L.A. Glow', 3, 9721, 100, 'edt', true);

        $match = $find->invoke(
            $matcher,
            80,
            'Jennifer Lopez',
            'L.A. Glow',
            'test 100ml edt',
            100.0,
            'edt',
            true,
            [80 => [$plainGlow, $laGlow]],
            null,
            'L.A. Glow',
            'l',
        );

        $this->assertNotNull($match);
        $this->assertSame(972, $match['product']->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_mandarina_duck_does_not_match_for_her_line(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $baseTokens = $tokens->invoke($matcher, 'Mandarina Duck', 'Mandarina Duck');
        $forHerTokens = $tokens->invoke($matcher, 'Mandarina Duck For Her', 'Mandarina Duck');

        $this->assertContains('mandarina', $baseTokens);
        $this->assertContains('duck', $baseTokens);
        $this->assertNotSame($baseTokens, $forHerTokens);

        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $baseProduct = $this->makeProductWithGenderOption(981, 90, 'Mandarina Duck', 3, 9811, 100, 'edt', true);
        $forHerProduct = $this->makeProductWithGenderOption(982, 90, 'Mandarina Duck For Her', 3, 9821, 100, 'edt', true);

        $match = $find->invoke(
            $matcher,
            90,
            'Mandarina Duck',
            'Mandarina Duck for Woman',
            'test 100ml edt',
            100.0,
            'edt',
            true,
            [90 => [$forHerProduct, $baseProduct]],
            null,
            'Mandarina Duck',
            'l',
        );

        $this->assertNotNull($match);
        $this->assertSame(981, $match['product']->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_rouge_smoking_extrait_prefers_extrait_product_over_base_line(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $baseProduct = $this->makeProductWithGenderOption(701, 20, 'Rouge Smoking', 3, 7011, 100, 'edp');
        $extraitProduct = $this->makeProductWithGenderOption(702, 20, 'Rouge Smoking Extrait', 3, 7021, 100, 'extrait de parfum', true);

        $match = $find->invoke(
            $matcher,
            20,
            'BDK Parfums',
            'Rouge Smoking Extrait',
            '100ml test',
            100.0,
            'extrait de parfum',
            true,
            [20 => [$baseProduct, $extraitProduct]],
            null,
            'Rouge Smoking Extrait',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(702, $match['product']->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_rouge_smoking_extrait_100ml_does_not_match_edp_variant_on_base_product(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $baseProduct = $this->makeProductWithGenderOption(711, 20, 'Rouge Smoking', 3, 7111, 100, 'edp');
        $extraitProduct = $this->makeProductWithGenderOption(712, 20, 'Rouge Smoking Extrait', 3, 7121, 100, 'extrait de parfum');

        $match = $find->invoke(
            $matcher,
            20,
            'BDK Parfums',
            'Rouge Smoking Extrait',
            '100ml',
            100.0,
            'extrait de parfum',
            false,
            [20 => [$baseProduct, $extraitProduct]],
            null,
            'Rouge Smoking Extrait',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(712, $match['product']->id);
        $this->assertSame(7121, $match['variant']?->id);
        $this->assertSame(100, $match['total']);
    }

    public function test_definition_volume_lookup_accepts_fractional_ml(): void
    {
        $matcher = new SellerOneVariantMatcher();

        $this->assertSame(1.5, $matcher->definitionVolumeMlForLookup(1.5));
        $this->assertSame(1.2, $matcher->definitionVolumeMlForLookup(1.2));
        $this->assertSame(2.0, $matcher->definitionVolumeMlForLookup(2.0));
        $this->assertSame(100.0, $matcher->definitionVolumeMlForLookup(100.0));
    }

    public function test_volumes_match_treats_comma_parsed_values_as_exact(): void
    {
        $matcher = new SellerOneVariantMatcher();

        $this->assertTrue($matcher->volumesMatch(1.5, 1.5));
        $this->assertFalse($matcher->volumesMatch(1.5, 2.0));
        $this->assertFalse($matcher->volumesMatch(1.2, 1.0));
        $this->assertTrue($matcher->volumesMatch(100.0, 100.0));
    }

    public function test_multipack_volume_not_equal_to_single_unit_volume(): void
    {
        $matcher = new SellerOneVariantMatcher();

        foreach ([
            ['3*10ml edp', 3],
            ['5*10ml edp', 5],
            ['7*10ml edp', 7],
            ['3 *10ml edp', 3],
            ['3 * 10ml edp', 3],
            ['3 * 10 ml edp', 3],
        ] as [$tail, $expectedCount]) {
            $spec = $matcher->parseVolumeFromText($tail);
            $this->assertTrue($spec['is_multipack'], $tail);
            $this->assertNull($spec['volume'], $tail);
            $this->assertSame($expectedCount, $spec['multipack_count'], $tail);
            $this->assertSame(10.0, $spec['multipack_unit_volume'], $tail);
        }

        $split = $matcher->splitNameAndVariantTail('Vilhelm Parfumerie Opus Kore 3*10ml edp');
        $this->assertSame('Vilhelm Parfumerie Opus Kore', $split['name']);
        $this->assertSame('3*10ml edp', $split['tail']);

        $core = new ReflectionMethod($matcher, 'coreVariantFieldsMatch');
        $core->setAccessible(true);
        $supplier = [
            'volume' => null,
            'volume_is_multipack' => true,
            'concentration' => 'edp',
            'is_tester' => false,
            'extra_tokens' => [],
        ];
        $catalog = ['volume' => 10.0, 'concentration' => 'edp', 'is_tester' => false];

        $this->assertFalse($core->invoke($matcher, $supplier, $catalog));
    }

    public function test_multipack_volume_supports_x_notation(): void
    {
        $matcher = new SellerOneVariantMatcher();

        foreach ([
            ['4 x 10ml edp', 4],
            ['4x10ml edp', 4],
            ['4 x10ml edp', 4],
        ] as [$tail, $expectedCount]) {
            $spec = $matcher->parseVolumeFromText($tail);
            $this->assertTrue($spec['is_multipack'], $tail);
            $this->assertSame($expectedCount, $spec['multipack_count'], $tail);
            $this->assertSame(10.0, $spec['multipack_unit_volume'], $tail);
        }

        $split = $matcher->splitNameAndVariantTail('Ormonde Jayne Levant 4 x 10ml edp');
        $this->assertSame('Ormonde Jayne Levant', $split['name']);
        $this->assertSame('4 x 10ml edp', $split['tail']);
    }

    public function test_combo_volume_set_does_not_match_single_catalog_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $parse = new ReflectionMethod($matcher, 'parseVariantTailSignature');
        $parse->setAccessible(true);
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        foreach ([
            'edp ( 100ml + 7,5ml )',
            'edp ( 100ml + 10ml + 7,5ml )',
            '20ml edp+20ml edp',
            '20ml+20ml edp',
        ] as $tail) {
            $spec = $matcher->parseVolumeFromText($tail);
            $this->assertTrue($spec['is_combo_set'], $tail);
            $this->assertNull($spec['volume'], $tail);

            $sig = $parse->invoke($matcher, $tail);
            $this->assertTrue($sig['volume_is_combo_set'], $tail);
            $this->assertNull($sig['volume'], $tail);
            $this->assertSame('edp', $sig['concentration'], $tail);
        }

        $definition = new VariantDefinition([
            'volume_ml' => 100,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 961]);
        $variant->id = 9611;
        $variant->volume = 100;
        $variant->concentration = 'edp';
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => '№2', 'brand_id' => 70]);
        $product->id = 961;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, 'edp ( 100ml + 7,5ml )', 'edp');
        $this->assertNull($match['variant']);
        $this->assertSame(90, $match['total']);

        $best = $find->invoke(
            $matcher,
            70,
            'Billie Eilish',
            '№ 2',
            'edp ( 100ml + 7,5ml )',
            null,
            'edp',
            false,
            [70 => [$product]],
            null,
            '№ 2',
            null,
        );
        $this->assertNotNull($best);
        $this->assertNull($best['variant']);
        $this->assertLessThan(100, $best['total']);

        $definition20 = new VariantDefinition([
            'volume_ml' => 20,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant20 = new ProductVariantLink(['product_id' => 962]);
        $variant20->id = 9621;
        $variant20->volume = 20;
        $variant20->concentration = 'edp';
        $variant20->setRelation('definition', $definition20);
        $gallantry = new Product(['name' => 'French Gallantry', 'brand_id' => 71]);
        $gallantry->id = 962;
        $gallantry->setRelation('variants', collect([$variant20]));

        $comboMatch = $resolve->invoke($matcher, $gallantry, '20ml edp+20ml edp', 'edp');
        $this->assertNull($comboMatch['variant']);
        $this->assertSame(90, $comboMatch['total']);
        $this->assertTrue($matcher->supplierVariantTailBlocksAutoLink('20ml edp+20ml edp'));
    }

    public function test_limited_edition_marker_blocks_match_without_catalog_le(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $parse = new ReflectionMethod($matcher, 'parseVariantTailSignature');
        $parse->setAccessible(true);
        $core = new ReflectionMethod($matcher, 'coreVariantFieldsMatch');
        $core->setAccessible(true);
        $hasLe = new ReflectionMethod($matcher, 'textHasLimitedEditionMarker');
        $hasLe->setAccessible(true);

        $this->assertFalse($hasLe->invoke($matcher, 'Le Parfumeur Le Parfumeur'));
        $this->assertTrue($hasLe->invoke($matcher, '50ml edt Edition Limitee'));

        $sig = $parse->invoke($matcher, '50ml edp L.E.');
        $this->assertTrue($sig['has_limited_edition']);
        $this->assertSame([], $sig['extra_tokens']);

        $supplier = [
            'volume' => 50.0,
            'volume_is_multipack' => false,
            'concentration' => 'edp',
            'is_tester' => false,
            'has_limited_edition' => true,
            'extra_tokens' => [],
        ];
        $catalogWithoutLe = [
            'volume' => 50.0,
            'concentration' => 'edp',
            'is_tester' => false,
            'has_limited_edition' => false,
        ];
        $catalogWithLe = [
            'volume' => 50.0,
            'concentration' => 'edp',
            'is_tester' => false,
            'has_limited_edition' => true,
        ];

        $this->assertFalse($core->invoke($matcher, $supplier, $catalogWithoutLe));
        $this->assertTrue($core->invoke($matcher, $supplier, $catalogWithLe));
    }

    public function test_edition_limitee_and_gold_do_not_match_plain_catalog_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $definition = new VariantDefinition([
            'volume_ml' => 50,
            'concentration_code' => 'edt',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 971]);
        $variant->id = 9711;
        $variant->volume = 50;
        $variant->concentration = 'edt';
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Le Parfumeur Le Parfumeur', 'brand_id' => 70]);
        $product->id = 971;
        $product->setRelation('variants', collect([$variant]));

        foreach (['50ml edt Edition Limitee', '50ml edt Edition Gold'] as $tail) {
            $match = $resolve->invoke($matcher, $product, $tail, 'edt');
            $this->assertNull($match['variant'], $tail);
            $this->assertSame(90, $match['total'], $tail);
            $this->assertSame('name_only', $match['link_match_level'], $tail);
        }
    }

    public function test_edition_suffix_tail_blocks_auto_link_helper(): void
    {
        $matcher = new SellerOneVariantMatcher();

        $this->assertTrue($matcher->supplierVariantTailBlocksAutoLink('50ml edt Edition Limitee'));
        $this->assertTrue($matcher->supplierVariantTailBlocksAutoLink('50ml edt Edition Gold'));
        $this->assertFalse($matcher->supplierVariantTailBlocksAutoLink('50ml edt'));
    }

    public function test_limited_edition_tail_does_not_full_match_plain_catalog_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $resolve = new ReflectionMethod($matcher, 'resolveExactNameVariantMatch');
        $resolve->setAccessible(true);

        $definition = new VariantDefinition([
            'volume_ml' => 50,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 801]);
        $variant->id = 8011;
        $variant->volume = 50;
        $variant->concentration = 'edp';
        $variant->setRelation('definition', $definition);
        $product = new Product(['name' => 'Strip', 'brand_id' => 12]);
        $product->id = 801;
        $product->setRelation('variants', collect([$variant]));

        $match = $resolve->invoke($matcher, $product, '50ml edp L.E.');
        $this->assertNull($match['variant']);
        $this->assertSame(90, $match['total']);
        $this->assertSame('name_only', $match['link_match_level']);
    }

    public function test_limited_edition_supplier_skips_plain_product_in_find_best_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $plain = $this->makeProductWithGenderOption(811, 12, 'Strip', 3, 8111, 50);
        $leProduct = $this->makeProductWithGenderOption(812, 12, 'Strip L.E.', 3, 8121, 50);

        $match = $find->invoke(
            $matcher,
            12,
            'Agent Provocateur',
            'Strip',
            '50ml edp L.E.',
            50.0,
            'edp',
            false,
            [12 => [$plain, $leProduct]],
            'female',
            'Strip',
            'l',
        );

        $this->assertNotNull($match);
        $this->assertSame(812, $match['product']->id);
        $this->assertSame(100, $match['total']);
    }

    public function test_product_edition_keys_require_exact_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'productEditionKeysMatch');
        $method->setAccessible(true);

        $this->assertFalse($method->invoke($matcher, 'Solution № 9', 'Solution №1'));
        $this->assertTrue($method->invoke($matcher, 'Solution № 9', 'Solution № 9'));
        $this->assertFalse($method->invoke(
            $matcher,
            'This Is Not A Blue Bottle 1/6',
            'This is Not a Blue Bottle 1.7',
        ));
        $this->assertTrue($method->invoke(
            $matcher,
            'This Is Not A Blue Bottle 1/6',
            'This Is Not A Blue Bottle 1/6',
        ));
        $this->assertFalse($method->invoke($matcher, 'Big Pony 1', 'Big Pony 4'));
        $this->assertTrue($method->invoke($matcher, 'Big Pony 1', 'Big Pony 1'));
        $this->assertFalse($method->invoke($matcher, 'The Only One 2', 'The Only One'));
        $this->assertTrue($method->invoke($matcher, 'The Only One 2', 'The Only One 2'));
    }

    public function test_trailing_line_number_is_preserved_in_match_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $withTwo = $tokens->invoke($matcher, 'The Only One 2', 'Dolce&Gabbana');
        $withoutTwo = $tokens->invoke($matcher, 'The Only One', 'Dolce&Gabbana');

        $this->assertContains('line2', $withTwo);
        $this->assertNotContains('line2', $withoutTwo);
    }

    public function test_the_only_one_2_prefers_sequel_product_over_base_line(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $base = $this->makeProductWithGenderOption(901, 40, 'The Only One', 3, 9011, 100, 'edp', true);
        $sequel = $this->makeProductWithGenderOption(902, 40, 'The Only One 2', 3, 9021, 100, 'edp', true);

        $match = $find->invoke(
            $matcher,
            40,
            'Dolce&Gabbana',
            'The Only One 2',
            'test 100ml edp',
            100.0,
            'edp',
            true,
            [40 => [$base, $sequel]],
            null,
            'The Only One 2',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(902, $match['product']->id);
        $this->assertSame(100, $match['total']);
    }

    public function test_the_only_one_2_does_not_match_base_product_when_sequel_missing(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $base = $this->makeProductWithGenderOption(911, 40, 'The Only One', 3, 9111, 100, 'edp', true);

        $match = $find->invoke(
            $matcher,
            40,
            'Dolce&Gabbana',
            'The Only One 2',
            'test 100ml edp',
            100.0,
            'edp',
            true,
            [40 => [$base]],
            null,
            'The Only One 2',
            null,
        );

        $this->assertNull($match);
    }

    public function test_trailing_line_letter_x_is_preserved_in_match_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $withX = $tokens->invoke($matcher, 'Hundred Silent Ways X', 'Nishane');
        $withoutX = $tokens->invoke($matcher, 'Hundred Silent Ways', 'Nishane');

        $this->assertContains('linex', $withX);
        $this->assertNotContains('linex', $withoutX);
    }

    public function test_hundred_silent_ways_x_prefers_x_product_over_base_line(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $base = $this->makeProductWithGenderOption(921, 41, 'Hundred Silent Ways', 438, 9211, 50, 'extrait de parfum', true);
        $withX = $this->makeProductWithGenderOption(922, 41, 'Hundred Silent Ways X', 438, 9221, 50, 'extrait de parfum', true);

        $match = $find->invoke(
            $matcher,
            41,
            'Nishane',
            'Hundred Silent Ways X',
            'test 50ml Extrait De Parfum',
            50.0,
            'extrait de parfum',
            true,
            [41 => [$base, $withX]],
            null,
            'Hundred Silent Ways X',
            null,
        );

        $this->assertNotNull($match);
        $this->assertSame(922, $match['product']->id);
        $this->assertSame(100, $match['total']);
    }

    public function test_hundred_silent_ways_x_does_not_match_base_product_when_x_line_missing(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $base = $this->makeProductWithGenderOption(931, 41, 'Hundred Silent Ways', 438, 9311, 50, 'extrait de parfum', true);

        $match = $find->invoke(
            $matcher,
            41,
            'Nishane',
            'Hundred Silent Ways X',
            'test 50ml Extrait De Parfum',
            50.0,
            'extrait de parfum',
            true,
            [41 => [$base]],
            null,
            'Hundred Silent Ways X',
            null,
        );

        $this->assertNull($match);
    }

    public function test_product_edition_keys_distinguish_trailing_letter_x(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'productEditionKeysMatch');
        $method->setAccessible(true);

        $this->assertFalse($method->invoke($matcher, 'Hundred Silent Ways X', 'Hundred Silent Ways'));
        $this->assertTrue($method->invoke($matcher, 'Hundred Silent Ways X', 'Hundred Silent Ways X'));
    }

    public function test_inline_line_letter_x_is_preserved_in_match_tokens(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $withX = $tokens->invoke($matcher, 'Nishane X Hacivat', 'Nishane');
        $withoutX = $tokens->invoke($matcher, 'Nishane Hacivat', 'Nishane');

        $this->assertContains('linex', $withX);
        $this->assertContains('hacivat', $withX);
        $this->assertNotContains('linex', $withoutX);
    }

    public function test_product_edition_keys_distinguish_inline_letter_x(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'productEditionKeysMatch');
        $method->setAccessible(true);

        $this->assertFalse($method->invoke($matcher, 'Nishane X Hacivat', 'Nishane Hacivat'));
        $this->assertTrue($method->invoke($matcher, 'Nishane X Hacivat', 'Nishane X Hacivat'));
    }

    public function test_nishane_x_hacivat_does_not_match_plain_hacivat_line(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $plain = $this->makeProductWithGenderOption(941, 41, 'Nishane Hacivat', 438, 9411, 50, 'extrait de parfum', true);
        $withX = $this->makeProductWithGenderOption(942, 41, 'Nishane X Hacivat', 438, 9421, 50, 'extrait de parfum', true);

        $matchWrong = $find->invoke(
            $matcher,
            41,
            'Nishane',
            'Nishane X Hacivat',
            'test 50ml Extrait De Parfum',
            50.0,
            'extrait de parfum',
            true,
            [41 => [$plain]],
            null,
            'Nishane X Hacivat',
            null,
        );
        $this->assertNull($matchWrong);

        $matchRight = $find->invoke(
            $matcher,
            41,
            'Nishane',
            'Nishane X Hacivat',
            'test 50ml Extrait De Parfum',
            50.0,
            'extrait de parfum',
            true,
            [41 => [$plain, $withX]],
            null,
            'Nishane X Hacivat',
            null,
        );
        $this->assertNotNull($matchRight);
        $this->assertSame(942, $matchRight['product']->id);
        $this->assertSame(100, $matchRight['total']);
    }

    public function test_split_keeps_line_number_in_name_before_test_marker(): void
    {
        $matcher = new SellerOneVariantMatcher();

        $split = $matcher->splitNameAndVariantTail('Dolce&Gabbana The Only One 2 test 100ml edp');
        $this->assertSame('Dolce&Gabbana The Only One 2', $split['name']);
        $this->assertSame('test 100ml edp', $split['tail']);
    }

    public function test_female_marker_pass1_for_woman_yields_full_variant_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $product = $this->makeProductWithGenderOption(951, 60, 'In Red Blooming Bouquet', 3, 9511, 100, 'edt');

        $pass1 = $find->invoke(
            $matcher,
            60,
            'Armand Basi',
            'IN Red Blooming Bouquet for Woman',
            '100ml edt',
            100.0,
            'edt',
            false,
            [60 => [$product]],
            null,
            'IN Red Blooming Bouquet',
            'l',
        );

        $this->assertNotNull($pass1);
        $this->assertSame(100, $pass1['total']);
        $this->assertSame('exact', $pass1['name_level']);
        $this->assertSame('full', $pass1['link_match_level']);
        $this->assertSame(9511, $pass1['variant']?->id);
    }

    public function test_male_supplier_marker_does_not_match_female_catalog_gender(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $conflict = new ReflectionMethod($matcher, 'supplierGenderConflictsCatalog');
        $conflict->setAccessible(true);
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $femaleProduct = new Product(['name' => 'Devotion', 'brand_id' => 55]);
        $femaleProduct->id = 901;
        $femaleValue = new ProductAttributeValue(['product_attribute_id' => 3]);
        $femaleValue->setRelation('selectedOptions', collect([
            new ProductAttributeValueOption(['product_attribute_option_id' => 3]),
        ]));
        $femaleProduct->setRelation('attributeValues', collect([$femaleValue]));

        $definition = new VariantDefinition([
            'volume_ml' => 50,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 901]);
        $variant->id = 9011;
        $variant->volume = 50;
        $variant->concentration = 'edp';
        $variant->setRelation('definition', $definition);
        $femaleProduct->setRelation('variants', collect([$variant]));

        $this->assertTrue($conflict->invoke($matcher, 'm', $femaleProduct));
        $this->assertFalse($conflict->invoke($matcher, 'l', $femaleProduct));

        $match = $find->invoke(
            $matcher,
            55,
            'Dolce&Gabbana',
            'Devotion',
            '50ml edp',
            50.0,
            'edp',
            false,
            [55 => [$femaleProduct]],
            'male',
            'Devotion',
            'm',
        );

        $this->assertNull($match);
    }

    public function test_female_supplier_marker_matches_on_female_attribute_pass(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $femaleProduct = $this->makeProductWithGenderOption(902, 55, 'Devotion', 3, 9021, 50);

        $match = $find->invoke(
            $matcher,
            55,
            'Dolce&Gabbana',
            'Devotion',
            '50ml edp',
            50.0,
            'edp',
            false,
            [55 => [$femaleProduct]],
            'female',
            'Devotion',
            'l',
        );

        $this->assertNotNull($match);
        $this->assertSame(902, $match['product']->id);
    }

    public function test_male_supplier_marker_does_not_match_unisex_only_on_male_pass(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $unisexProduct = $this->makeProductWithGenderOption(903, 55, 'Devotion', 438, 9031, 50);

        $match = $find->invoke(
            $matcher,
            55,
            'Dolce&Gabbana',
            'Devotion',
            '50ml edp',
            50.0,
            'edp',
            false,
            [55 => [$unisexProduct]],
            'male',
            'Devotion',
            'm',
        );

        $this->assertNull($match);
    }

    public function test_male_pass1_for_man_does_not_match_unisex_catalog_product(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $unisexProduct = $this->makeProductWithGenderOption(
            961,
            70,
            'Carolina Herrera Carolina Herrera',
            438,
            9611,
            100,
            'edt',
            true,
        );

        $pass1 = $find->invoke(
            $matcher,
            70,
            'Carolina Herrera',
            'Carolina Herrera for Man',
            'test 100ml edt',
            100.0,
            'edt',
            true,
            [70 => [$unisexProduct]],
            null,
            'Carolina Herrera',
            'm',
        );

        $this->assertNull($pass1);
    }

    public function test_female_pass1_for_woman_does_not_match_unisex_catalog_product(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $unisexProduct = $this->makeProductWithGenderOption(
            962,
            70,
            'Carolina Herrera Carolina Herrera',
            438,
            9621,
            100,
            'edt',
            true,
        );

        $pass1 = $find->invoke(
            $matcher,
            70,
            'Carolina Herrera',
            'Carolina Herrera for Woman',
            'test 100ml edt',
            100.0,
            'edt',
            true,
            [70 => [$unisexProduct]],
            null,
            'Carolina Herrera',
            'l',
        );

        $this->assertNull($pass1);
    }

    public function test_female_pass3_unisex_matches_unisex_catalog_product(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $unisexProduct = $this->makeProductWithGenderOption(
            963,
            70,
            'Carolina Herrera Carolina Herrera',
            438,
            9631,
            100,
            'edt',
            true,
        );

        $pass3 = $find->invoke(
            $matcher,
            70,
            'Carolina Herrera',
            'Carolina Herrera',
            'test 100ml edt',
            100.0,
            'edt',
            true,
            [70 => [$unisexProduct]],
            'unisex',
            'Carolina Herrera',
            'l',
        );

        $this->assertNotNull($pass3);
        $this->assertSame(963, $pass3['product']->id);
        $this->assertSame(100, $pass3['total']);
    }

    public function test_supplier_gender_conflicts_catalog_blocks_unisex_outside_unisex_pass(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $conflict = new ReflectionMethod($matcher, 'supplierGenderConflictsCatalog');
        $conflict->setAccessible(true);

        $unisexProduct = $this->makeProductWithGenderOption(964, 70, 'Carolina Herrera Carolina Herrera', 438, 9641, 100);

        $this->assertTrue($conflict->invoke($matcher, 'm', $unisexProduct));
        $this->assertTrue($conflict->invoke($matcher, 'l', $unisexProduct));
        $this->assertFalse($conflict->invoke($matcher, 'l', $unisexProduct, 'unisex'));
    }

    public function test_extended_brand_family_matches_product_under_longer_brand_name(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $baseBrand = new Brand(['name' => '12 Parfumeurs']);
        $baseBrand->id = 71;
        $extendedBrand = new Brand(['name' => '12 Parfumeurs Francais']);
        $extendedBrand->id = 72;

        $product = $this->makeProductWithGenderOption(1001, 72, 'Ma Reine', 438, 10011, 100, 'edp');
        $product->setRelation('brand', $extendedBrand);

        $match = $find->invoke(
            $matcher,
            71,
            '12 Parfumeurs',
            'Ma Reine',
            '100ml edp',
            100.0,
            'edp',
            false,
            [71 => [], 72 => [$product]],
            null,
            'Ma Reine',
            null,
            collect([$baseBrand, $extendedBrand]),
        );

        $this->assertNotNull($match);
        $this->assertSame(1001, $match['product']->id);
        $this->assertSame(100, $match['total']);
        $this->assertSame('full', $match['link_match_level']);
    }

    public function test_catalog_extra_one_catalog_word_suggests_similar_product_with_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $find = new ReflectionMethod($matcher, 'findBestMatch');
        $find->setAccessible(true);

        $brand = new Brand(['name' => '12 Parfumeurs']);
        $brand->id = 71;

        $product = $this->makeProductWithGenderOption(1002, 71, 'Francais Ma Reine', 438, 10021, 100, 'edp');
        $product->setRelation('brand', $brand);

        $match = $find->invoke(
            $matcher,
            71,
            '12 Parfumeurs',
            'Ma Reine',
            '100ml edp',
            100.0,
            'edp',
            false,
            [71 => [$product]],
            null,
            'Ma Reine',
            null,
            collect([$brand]),
        );

        $this->assertNotNull($match);
        $this->assertSame(1002, $match['product']->id);
        $this->assertSame('catalog_extra', $match['name_level']);
        $this->assertSame(50, $match['total']);
        $this->assertNotNull($match['variant']);
        $this->assertSame(10021, $match['variant']->id);
    }

    private function makeProductWithGenderOption(
        int $productId,
        int $brandId,
        string $name,
        int $genderOptionId,
        int $variantId,
        int $volumeMl,
        string $concentration = 'edp',
        bool $isTester = false,
    ): Product {
        $product = new Product(['name' => $name, 'brand_id' => $brandId]);
        $product->id = $productId;
        $value = new ProductAttributeValue(['product_attribute_id' => 3]);
        $value->setRelation('selectedOptions', collect([
            new ProductAttributeValueOption(['product_attribute_option_id' => $genderOptionId]),
        ]));
        $product->setRelation('attributeValues', collect([$value]));

        $definition = new VariantDefinition([
            'volume_ml' => $volumeMl,
            'concentration_code' => $concentration,
            'is_tester' => $isTester,
        ]);
        $variant = new ProductVariantLink(['product_id' => $productId]);
        $variant->id = $variantId;
        $variant->volume = $volumeMl;
        $variant->concentration = $concentration;
        $variant->setRelation('definition', $definition);
        $product->setRelation('variants', collect([$variant]));

        return $product;
    }
}
