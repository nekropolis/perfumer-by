<?php

namespace Tests\Unit;

use Modules\Catalog\Support\CatalogSearchScoring;
use PHPUnit\Framework\TestCase;

class CatalogSearchScoringCompactTest extends TestCase
{
    public function test_compact_search_text_collapses_spaces(): void
    {
        $this->assertSame('montblancsignature', CatalogSearchScoring::compactSearchText('Montblanc Signature'));
        $this->assertSame('montblancsignature', CatalogSearchScoring::compactSearchText('Mont Blanc Signature'));
        $this->assertSame('montblancs', CatalogSearchScoring::compactSearchText('Mont blanc S'));
    }

    public function test_product_search_rank_matches_montblanc_without_space(): void
    {
        $rank = CatalogSearchScoring::productSearchRank('Montblanc Signature', 'Mont Blanc', 'Signature');
        $this->assertSame(0, $rank['tier']);

        $prefix = CatalogSearchScoring::productSearchRank('Mont blanc S', 'Mont Blanc', 'Signature');
        $this->assertLessThanOrEqual(1, $prefix['tier']);

        $spaced = CatalogSearchScoring::productSearchRank('Mont Blanc Signature', 'Mont Blanc', 'Signature');
        $this->assertSame(0, $spaced['tier']);
    }
}
