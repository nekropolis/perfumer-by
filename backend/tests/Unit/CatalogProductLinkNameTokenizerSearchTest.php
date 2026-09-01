<?php

namespace Tests\Unit;

use Modules\Catalog\Support\CatalogProductLinkNameTokenizer;
use PHPUnit\Framework\TestCase;

class CatalogProductLinkNameTokenizerSearchTest extends TestCase
{
    public function test_link_search_tokens_keep_trailing_numbers_in_product_name(): void
    {
        $tokens = CatalogProductLinkNameTokenizer::linkSearchTokensFromRest('Honour 43', null);

        $this->assertContains('honour', $tokens);
        $this->assertContains('43', $tokens);
        $this->assertNotContains('line43', $tokens);
    }

    public function test_link_search_tokens_keep_year_like_numbers(): void
    {
        $tokens = CatalogProductLinkNameTokenizer::linkSearchTokensFromRest('Moon 1947 Gold', null);

        $this->assertContains('moon', $tokens);
        $this->assertContains('1947', $tokens);
        $this->assertContains('gold', $tokens);
        $this->assertNotContains('line1947', $tokens);
    }

    public function test_variant_match_tokens_still_convert_line_suffix_for_seller_one(): void
    {
        $tokens = CatalogProductLinkNameTokenizer::variantMatchTokens('Flora G', null);

        $this->assertContains('flora', $tokens);
        $this->assertContains('lineg', $tokens);
    }

    public function test_hyphenated_name_keeps_hyphen_as_single_token(): void
    {
        $tokens = CatalogProductLinkNameTokenizer::variantMatchTokens('Masaki T-mat', 'Masaki');

        $this->assertSame(['t-mat'], $tokens);
    }

    public function test_hyphenated_name_does_not_match_non_hyphenated_name(): void
    {
        $matTokens = CatalogProductLinkNameTokenizer::variantMatchTokens('Masaki Mat', 'Masaki');
        $tMatTokens = CatalogProductLinkNameTokenizer::variantMatchTokens('Masaki T-mat', 'Masaki');

        $this->assertSame(['mat'], $matTokens);
        $this->assertSame(['t-mat'], $tMatTokens);
        $this->assertNotSame($matTokens, $tMatTokens);
    }

    public function test_standalone_hyphens_are_trimmed(): void
    {
        $tokens = CatalogProductLinkNameTokenizer::variantMatchTokens('Product - name -', null);

        $this->assertContains('product', $tokens);
        $this->assertContains('name', $tokens);
        $this->assertNotContains('-', $tokens);
    }

    public function test_variant_match_tokens_keep_single_letter_line_words(): void
    {
        $tokens = CatalogProductLinkNameTokenizer::variantMatchTokens('Q Intense', null);

        $this->assertSame(['q', 'intense'], $tokens);
    }

    public function test_limited_edition_abbreviation_is_stripped_from_match_tokens(): void
    {
        $tokens = CatalogProductLinkNameTokenizer::variantMatchTokens('Strip L.E.', null);

        $this->assertSame(['strip'], $tokens);
    }

    public function test_split_leading_brand_requires_word_boundary(): void
    {
        $brands = [
            (object) ['id' => 1, 'name' => 'Si'],
            (object) ['id' => 2, 'name' => 'Montblanc'],
        ];

        $noBrand = CatalogProductLinkNameTokenizer::splitLeadingBrand('Signature Absolue', $brands);
        $this->assertNull($noBrand['brand_id']);
        $this->assertSame('Signature Absolue', $noBrand['rest']);

        $withBrand = CatalogProductLinkNameTokenizer::splitLeadingBrand('Montblanc Signature Absolue', $brands);
        $this->assertSame(2, $withBrand['brand_id']);
        $this->assertSame('Signature Absolue', $withBrand['rest']);

        $exactBrandName = CatalogProductLinkNameTokenizer::splitLeadingBrand('Signature Absolue', [
            (object) ['id' => 3, 'name' => 'Signature'],
        ]);
        $this->assertSame(3, $exactBrandName['brand_id']);
        $this->assertSame('Absolue', $exactBrandName['rest']);
    }
}
