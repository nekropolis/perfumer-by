<?php

namespace Tests\Unit;

use Modules\Catalog\Support\ProductMetaTitleBuilder;
use PHPUnit\Framework\TestCase;

class ProductMetaTitleBuilderTest extends TestCase
{
    public function test_builds_base_template_without_price(): void
    {
        $this->assertSame(
            'Dior Sauvage купить в Минске и Беларуси',
            ProductMetaTitleBuilder::buildAutomatic('Dior Sauvage'),
        );
    }

    public function test_includes_price_when_it_fits(): void
    {
        $this->assertSame(
            'Dior Sauvage купить в Минске и Беларуси — цена 199.00 BYN',
            ProductMetaTitleBuilder::buildAutomatic('Dior Sauvage', '199.00'),
        );
    }

    public function test_drops_price_when_too_long(): void
    {
        $name = 'Maison Francis Kurkdjian Baccarat Rouge 540';
        $title = ProductMetaTitleBuilder::buildAutomatic($name, '450.00');

        $this->assertStringNotContainsString('цена', $title);
        $this->assertLessThanOrEqual(ProductMetaTitleBuilder::MAX_LENGTH, mb_strlen($title));
    }

    public function test_build_keeps_manual_override(): void
    {
        $this->assertSame(
            'Dior Sauvage оригинал',
            ProductMetaTitleBuilder::build('Dior Sauvage оригинал', 'Dior Sauvage', '199.00'),
        );
    }

    public function test_build_treats_display_name_as_empty(): void
    {
        $this->assertSame(
            'Dior Sauvage купить в Минске и Беларуси',
            ProductMetaTitleBuilder::build('Dior Sauvage', 'Dior Sauvage'),
        );
    }
}
