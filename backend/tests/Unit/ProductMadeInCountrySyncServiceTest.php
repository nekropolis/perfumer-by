<?php

namespace Tests\Unit;

use Illuminate\Database\Eloquent\Collection;
use Modules\Catalog\Models\ProductAttributeOption;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;
use Modules\Catalog\Services\ProductMadeInCountrySyncService;
use Modules\Catalog\Support\CatalogProductAttributeIds;
use Tests\TestCase;

class ProductMadeInCountrySyncServiceTest extends TestCase
{
    public function test_country_from_selected_option(): void
    {
        $option = new ProductAttributeOption(['name' => 'Франция']);
        $selected = new ProductAttributeValueOption;
        $selected->setRelation('productAttributeOption', $option);

        $value = new ProductAttributeValue;
        $value->product_attribute_id = CatalogProductAttributeIds::MADE_IN_ATTRIBUTE_ID;
        $value->setRelation('selectedOptions', new Collection([$selected]));

        $this->assertSame(
            'Франция',
            ProductMadeInCountrySyncService::countryFromAttributeValues([$value]),
        );
    }

    public function test_country_from_custom_value_when_option_missing(): void
    {
        $value = new ProductAttributeValue(['custom_value' => 'Италия']);
        $value->product_attribute_id = CatalogProductAttributeIds::MADE_IN_ATTRIBUTE_ID;
        $value->setRelation('selectedOptions', new Collection);

        $this->assertSame(
            'Италия',
            ProductMadeInCountrySyncService::countryFromAttributeValues([$value]),
        );
    }

    public function test_ignores_other_attributes(): void
    {
        $value = new ProductAttributeValue(['custom_value' => 'женские']);
        $value->product_attribute_id = CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID;
        $value->setRelation('selectedOptions', new Collection);

        $this->assertNull(
            ProductMadeInCountrySyncService::countryFromAttributeValues([$value]),
        );
    }
}
