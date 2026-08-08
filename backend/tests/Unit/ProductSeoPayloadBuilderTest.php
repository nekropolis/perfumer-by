<?php

namespace Tests\Unit;

use Illuminate\Database\Eloquent\Collection;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeOption;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;
use Modules\Catalog\Services\SeoDescription\ProductSeoPayloadBuilder;
use Tests\TestCase;

class ProductSeoPayloadBuilderTest extends TestCase
{
    public function test_maps_display_name_current_fields_and_specs(): void
    {
        config()->set('seo_description.site', 'perfumer');

        $brand = new Brand(['name' => 'Dior']);
        $attribute = new ProductAttribute(['name' => 'Объём']);
        $option60 = new ProductAttributeOption(['name' => '60 мл']);
        $option100 = new ProductAttributeOption(['name' => '100 мл']);

        $value = new ProductAttributeValue;
        $value->setRelation('productAttribute', $attribute);
        $value->setRelation('selectedOptions', new Collection([
            $this->selectedOption($option60),
            $this->selectedOption($option100),
        ]));

        $product = new Product([
            'name' => 'Sauvage',
            'h1' => 'Dior Sauvage',
            'seo_description' => 'Краткий SEO текст',
            'description' => '<p>Текущее описание</p>',
        ]);
        $product->setRelation('brand', $brand);
        $product->setRelation('attributeValues', new Collection([$value]));

        $payload = (new ProductSeoPayloadBuilder)->build($product, [
            'seo_description',
            'description',
        ]);

        $this->assertSame('Dior Sauvage', $payload['product_name']);
        $this->assertSame(['60 мл', '100 мл'], $payload['specs']['Объём']);
        $this->assertSame([
            'seo_description' => 'Краткий SEO текст',
            'description' => '<p>Текущее описание</p>',
        ], $payload['fields']);
        $this->assertSame('perfumer', $payload['site']);
    }

    private function selectedOption(ProductAttributeOption $option): ProductAttributeValueOption
    {
        $selected = new ProductAttributeValueOption;
        $selected->setRelation('productAttributeOption', $option);

        return $selected;
    }
}
