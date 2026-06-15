<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class SellerOneVariantMatcherCatalogExtraTest extends TestCase
{
    public function test_supplier_matches_catalog_with_one_extra_catalog_token(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'supplierMatchesCatalogWithOneExtraCatalogToken');
        $method->setAccessible(true);

        $this->assertTrue($method->invoke(
            $matcher,
            ['stronger', 'with', 'you', 'tobacco'],
            ['armani', 'stronger', 'with', 'you', 'tobacco'],
        ));
    }

    public function test_rejects_when_catalog_extra_word_breaks_tail_match(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'supplierMatchesCatalogWithOneExtraCatalogToken');
        $method->setAccessible(true);

        $this->assertFalse($method->invoke(
            $matcher,
            ['stronger', 'with', 'you', 'only'],
            ['armani', 'stronger', 'with', 'you', 'tobacco'],
        ));
    }

    public function test_apply_title_rules_skips_when_replacement_already_at_start(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'applyTitleRules');
        $method->setAccessible(true);

        $title = 'Giorgio Armani Emporio Stronger With You Tobacco 100ml edt';
        $rules = collect([
            (object) ['pattern' => 'Armani', 'replacement' => 'Giorgio Armani Emporio'],
        ]);

        $result = $method->invoke($matcher, $title, $rules);

        $this->assertSame($title, $result);
    }
}
