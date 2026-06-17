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

    public function test_catalog_extra_gender_only_suffix_detected(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $method = new ReflectionMethod($matcher, 'catalogExtraIsGenderOnlySuffix');
        $method->setAccessible(true);

        $this->assertTrue($method->invoke(
            $matcher,
            ['just', 'rock'],
            ['just', 'rock', '__linkgm__'],
        ));
        $this->assertFalse($method->invoke(
            $matcher,
            ['just', 'rock'],
            ['just', 'rock', 'intense'],
        ));
    }

    public function test_pour_homme_in_catalog_requires_pour_homme_in_supplier_name(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $catalogMethod = new ReflectionMethod($matcher, 'catalogNameContainsPourLineSuffix');
        $catalogMethod->setAccessible(true);
        $supplierMethod = new ReflectionMethod($matcher, 'supplierBaseContainsPourLineWords');
        $supplierMethod->setAccessible(true);
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $this->assertTrue($catalogMethod->invoke($matcher, 'Iceberg Eau de Iceberg Pour Homme'));
        $this->assertFalse($supplierMethod->invoke($matcher, 'Eau De Iceberg'));
        $this->assertTrue($supplierMethod->invoke($matcher, 'Guilty Pour Homme'));

        $this->assertSame(
            ['eau', 'de', 'iceberg', 'pour', 'homme'],
            $tokens->invoke($matcher, 'Iceberg Eau de Iceberg Pour Homme', 'Iceberg'),
        );
        $this->assertSame(
            ['guilty', 'pour', 'homme'],
            $tokens->invoke($matcher, 'Guilty Pour Homme', 'Gucci'),
        );
    }

    public function test_parfum_line_requires_parfum_in_supplier_name(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $catalogMethod = new ReflectionMethod($matcher, 'catalogNameContainsParfumLineWord');
        $catalogMethod->setAccessible(true);
        $supplierMethod = new ReflectionMethod($matcher, 'supplierBaseContainsParfumLineWord');
        $supplierMethod->setAccessible(true);
        $tokens = new ReflectionMethod($matcher, 'productNameTokens');
        $tokens->setAccessible(true);

        $this->assertTrue($catalogMethod->invoke($matcher, 'Missoni Parfum Pour Homme'));
        $this->assertFalse($supplierMethod->invoke($matcher, 'Pour Homme'));
        $this->assertSame(
            ['de', 'pour', 'homme'],
            $tokens->invoke($matcher, 'Missoni Parfum Pour Homme', 'Missoni'),
        );
        $this->assertSame(
            ['pour', 'homme'],
            $tokens->invoke($matcher, 'Pour Homme', 'Missoni'),
        );
    }
}
