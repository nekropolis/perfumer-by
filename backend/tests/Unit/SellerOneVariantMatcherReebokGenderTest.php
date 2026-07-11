<?php

namespace Tests\Unit;

use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use Tests\TestCase;

class SellerOneVariantMatcherReebokGenderTest extends TestCase
{
    public function test_reebok_move_your_spirit_m_and_l_match_correct_gendered_products(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $brands = collect([(object) ['id' => 100, 'name' => 'Reebok']]);
        $rules = collect();

        $femaleProduct = $this->makeProductWithGenderOption(
            3289,
            100,
            'Move Your Spirit',
            3,
            32891,
            100,
            'edt',
            true,
        );
        $maleProduct = $this->makeProductWithGenderOption(
            3288,
            100,
            'Move Your Spirit For Men',
            35,
            32881,
            100,
            'edt',
            true,
        );
        $productsIndex = [100 => [$femaleProduct, $maleProduct]];

        $maleRow = $matcher->parseSupplierRow(
            ['code' => 'rb-m', 'title' => 'Reebok Move Your Spirit (M) test 100ml edt'],
            $brands,
            $rules,
            $productsIndex,
        );
        $femaleRow = $matcher->parseSupplierRow(
            ['code' => 'rb-l', 'title' => 'Reebok Move Your Spirit (L) test 100ml edt'],
            $brands,
            $rules,
            $productsIndex,
        );

        $this->assertSame(3288, $maleRow['suggested_product']['id'] ?? null);
        $this->assertSame(32881, $maleRow['suggested_variant']['id'] ?? null);
        $this->assertNotSame(3289, $maleRow['suggested_product']['id'] ?? null);

        $this->assertSame(3289, $femaleRow['suggested_product']['id'] ?? null);
        $this->assertSame(32891, $femaleRow['suggested_variant']['id'] ?? null);
        $this->assertNotSame(3288, $femaleRow['suggested_product']['id'] ?? null);
    }

    public function test_reebok_m_does_not_fallback_to_female_product_when_male_line_has_no_variant(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $brands = collect([(object) ['id' => 100, 'name' => 'Reebok']]);
        $rules = collect();

        $femaleProduct = $this->makeProductWithGenderOption(
            3289,
            100,
            'Move Your Spirit',
            3,
            32891,
            100,
            'edt',
            true,
        );
        $maleProduct = $this->makeProductWithGenderOption(
            3288,
            100,
            'Move Your Spirit For Men',
            35,
            32881,
            50,
            'edt',
            false,
        );
        $productsIndex = [100 => [$femaleProduct, $maleProduct]];

        $maleRow = $matcher->parseSupplierRow(
            ['code' => 'rb-m', 'title' => 'Reebok Move Your Spirit (M) test 100ml edt'],
            $brands,
            $rules,
            $productsIndex,
        );

        $this->assertSame(3288, $maleRow['suggested_product']['id'] ?? null);
        $this->assertNull($maleRow['suggested_variant']);
        $this->assertNotSame(3289, $maleRow['suggested_product']['id'] ?? null);
    }

    public function test_reebok_m_does_not_match_female_product_without_gender_attribute(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $brands = collect([(object) ['id' => 100, 'name' => 'Reebok']]);
        $rules = collect();

        $brand = new Brand(['name' => 'Reebok']);
        $brand->id = 100;

        $femaleWithoutGender = new Product(['name' => 'Move Your Spirit', 'brand_id' => 100]);
        $femaleWithoutGender->id = 3289;
        $femaleWithoutGender->setRelation('brand', $brand);
        $femaleWithoutGender->setRelation('attributeValues', collect());
        $femaleDefinition = new VariantDefinition([
            'volume_ml' => 100,
            'concentration_code' => 'edt',
            'is_tester' => true,
        ]);
        $femaleVariant = new ProductVariantLink(['product_id' => 3289]);
        $femaleVariant->id = 32891;
        $femaleVariant->volume = 100;
        $femaleVariant->concentration = 'edt';
        $femaleVariant->setRelation('definition', $femaleDefinition);
        $femaleVariant->setRelation('product', $femaleWithoutGender);
        $femaleWithoutGender->setRelation('variants', collect([$femaleVariant]));

        $maleProduct = $this->makeProductWithGenderOption(
            3288,
            100,
            'Move Your Spirit For Men',
            35,
            32881,
            100,
            'edt',
            true,
        );
        $productsIndex = [100 => [$femaleWithoutGender, $maleProduct]];

        $maleRow = $matcher->parseSupplierRow(
            ['code' => 'rb-m', 'title' => 'Reebok Move Your Spirit (M) test 100ml edt'],
            $brands,
            $rules,
            $productsIndex,
        );

        $this->assertSame(3288, $maleRow['suggested_product']['id'] ?? null);
        $this->assertSame(32881, $maleRow['suggested_variant']['id'] ?? null);
        $this->assertNotSame(3289, $maleRow['suggested_product']['id'] ?? null);
    }

    public function test_female_edp_marker_does_not_match_male_catalog_product(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $brands = collect([(object) ['id' => 101, 'name' => 'Versace']]);
        $rules = collect();
        $maleProduct = $this->makeProductWithGenderOption(
            5001,
            101,
            'Eros',
            35,
            50011,
            100,
            'edp',
        );
        $maleProduct->brand->name = 'Versace';

        $row = $matcher->parseSupplierRow(
            ['code' => 'versace-eros-l', 'title' => 'Versace Eros (L) 100ml edp'],
            $brands,
            $rules,
            [101 => [$maleProduct]],
        );

        $this->assertNull($row['suggested_variant']);
        $this->assertNull($row['suggested_product']);
    }

    public function test_devotion_m_matches_pour_homme_not_female_line(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $brands = collect([(object) ['id' => 10, 'name' => 'Dolce&Gabbana']]);
        $rules = collect();

        $femaleProduct = $this->makeProductWithGenderOption(
            13663,
            10,
            'Devotion',
            3,
            136631,
            100,
            'edp',
            true,
        );
        $femaleProduct->brand->name = 'Dolce & Gabbana';
        $maleProduct = $this->makeProductWithGenderOption(
            13794,
            10,
            'Devotion Pour Homme',
            35,
            137941,
            100,
            'edp',
        );
        $maleProduct->brand->name = 'Dolce & Gabbana';

        $maleRow = $matcher->parseSupplierRow(
            ['code' => 'dg-m', 'title' => 'Dolce&Gabbana Devotion (M) 100ml edp'],
            $brands,
            $rules,
            [10 => [$femaleProduct, $maleProduct]],
        );
        $femaleRow = $matcher->parseSupplierRow(
            ['code' => 'dg-l', 'title' => 'Dolce&Gabbana Devotion (L) test 100ml edp'],
            $brands,
            $rules,
            [10 => [$femaleProduct, $maleProduct]],
        );

        $this->assertSame(13794, $maleRow['suggested_product']['id'] ?? null);
        $this->assertSame(137941, $maleRow['suggested_variant']['id'] ?? null);
        $this->assertNotSame(13663, $maleRow['suggested_product']['id'] ?? null);

        $this->assertSame(13663, $femaleRow['suggested_product']['id'] ?? null);
        $this->assertSame(136631, $femaleRow['suggested_variant']['id'] ?? null);
    }

    public function test_devotion_m_does_not_match_female_when_gender_attr_missing(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $brands = collect([(object) ['id' => 10, 'name' => 'Dolce&Gabbana']]);
        $rules = collect();

        $brand = new Brand(['name' => 'Dolce & Gabbana']);
        $brand->id = 10;
        $femaleWithoutGender = new Product(['name' => 'Devotion', 'brand_id' => 10]);
        $femaleWithoutGender->id = 13663;
        $femaleWithoutGender->setRelation('brand', $brand);
        $femaleWithoutGender->setRelation('attributeValues', collect());
        $definition = new VariantDefinition([
            'volume_ml' => 100,
            'concentration_code' => 'edp',
            'is_tester' => false,
        ]);
        $variant = new ProductVariantLink(['product_id' => 13663]);
        $variant->id = 136631;
        $variant->volume = 100;
        $variant->concentration = 'edp';
        $variant->setRelation('definition', $definition);
        $variant->setRelation('product', $femaleWithoutGender);
        $femaleWithoutGender->setRelation('variants', collect([$variant]));

        $maleRow = $matcher->parseSupplierRow(
            ['code' => 'dg-m', 'title' => 'Dolce&Gabbana Devotion (M) 100ml edp'],
            $brands,
            $rules,
            [10 => [$femaleWithoutGender]],
        );

        $this->assertNull($maleRow['suggested_variant']);
        $this->assertNotSame(13663, $maleRow['suggested_product']['id'] ?? null);
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
        $brand = new Brand(['name' => 'Reebok']);
        $brand->id = $brandId;

        $product = new Product(['name' => $name, 'brand_id' => $brandId]);
        $product->id = $productId;
        $product->setRelation('brand', $brand);
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
        $variant->setRelation('product', $product);
        $product->setRelation('variants', collect([$variant]));

        return $product;
    }
}
