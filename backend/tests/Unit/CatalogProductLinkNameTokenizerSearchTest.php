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
}
