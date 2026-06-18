<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;
use PHPUnit\Framework\TestCase;

class VanilleBrandParserEnsureBrandTest extends TestCase
{
    public function test_infer_brand_slug_from_lartisan_product_url(): void
    {
        $slug = VanilleBrandParser::inferBrandSlugFromProductUrl(
            "L'Artisan Parfumeur",
            'https://vanille.by/lartisan-parfumeur-amour-nocturne',
        );

        $this->assertSame('lartisan-parfumeur', $slug);
    }

    public function test_brand_slug_candidates_include_compact_l_prefix(): void
    {
        $candidates = VanilleBrandParser::brandSlugCandidatesFromName("L'Artisan Parfumeur");

        $this->assertContains('l-artisan-parfumeur', $candidates);
        $this->assertContains('lartisan-parfumeur', $candidates);
    }

    public function test_normalize_brand_lookup_name_unifies_curly_apostrophe(): void
    {
        $curly = "L\u{2019}Artisan Parfumeur";
        $straight = "L'Artisan Parfumeur";

        $this->assertSame(
            VanilleBrandParser::normalizeBrandLookupName($straight),
            VanilleBrandParser::normalizeBrandLookupName($curly),
        );
    }
}
