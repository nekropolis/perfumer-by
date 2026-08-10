<?php

namespace Tests\Unit;

use Modules\Catalog\Services\SeoDescription\ProductSeoResultValidator;
use Modules\Catalog\Services\SeoDescription\SeoDescriptionException;
use PHPUnit\Framework\TestCase;

class ProductSeoResultValidatorTest extends TestCase
{
    public function test_validates_all_supported_fields(): void
    {
        $description = '<p>'.str_repeat('Аромат с проверенными характеристиками. ', 22).'</p>';
        $result = (new ProductSeoResultValidator)->validate([
            'seo_description',
            'short_description',
            'description',
        ], [
            'seo_description' => 'Оригинальный аромат Dior Sauvage с подробным описанием характеристик.',
            'short_description' => str_repeat('Оригинальный аромат Dior Sauvage. ', 6),
            'description' => $description,
        ]);

        $this->assertSame($description, $result['description']);
    }

    public function test_accepts_short_description_under_150_chars(): void
    {
        $short = 'Мужской фужерно-пряный аромат Antonio Banderas.';
        $this->assertLessThan(150, mb_strlen($short));

        $result = (new ProductSeoResultValidator)->validateAvailable([
            'seo_description' => 'Купить оригинал в Минске с доставкой.',
            'short_description' => $short,
            'description' => '<p>'.str_repeat('Оригинальный аромат с проверенными характеристиками. ', 20).'</p>',
        ]);

        $this->assertSame($short, $result['short_description']);
    }

    public function test_accepts_description_from_500_chars(): void
    {
        $plain = str_repeat('Аромат с характерными нотами. ', 18);
        $this->assertGreaterThanOrEqual(500, mb_strlen($plain));
        $this->assertLessThan(700, mb_strlen($plain));

        $description = '<p>'.$plain.'</p>';
        $result = (new ProductSeoResultValidator)->validateAvailable([
            'description' => $description,
        ]);

        $this->assertSame($description, $result['description']);
    }

    public function test_rejects_description_under_500_chars(): void
    {
        $this->expectException(SeoDescriptionException::class);
        $this->expectExceptionMessage('description length is invalid');

        (new ProductSeoResultValidator)->validateAvailable([
            'description' => '<p>'.str_repeat('Короткий текст. ', 10).'</p>',
        ]);
    }

    public function test_rejects_attributes_in_description_html(): void
    {
        $this->expectException(SeoDescriptionException::class);
        $this->expectExceptionMessage('must not have attributes');

        (new ProductSeoResultValidator)->validate(['description'], [
            'description' => '<p class="lead">'.str_repeat('Описание аромата. ', 50).'</p>',
        ]);
    }

    public function test_rejects_missing_or_extra_result_fields(): void
    {
        $this->expectException(SeoDescriptionException::class);
        $this->expectExceptionMessage('do not match');

        (new ProductSeoResultValidator)->validate(['seo_description'], [
            'seo_description' => 'Title',
            'short_description' => 'Extra',
        ]);
    }

    public function test_reports_unsupported_field_name(): void
    {
        $this->expectException(SeoDescriptionException::class);
        $this->expectExceptionMessage('Unsupported SEO result field: seo_keyword.');

        (new ProductSeoResultValidator)->validate(['seo_keyword'], [
            'seo_keyword' => 'legacy keyword',
        ]);
    }
}
