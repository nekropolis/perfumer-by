<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use Modules\ImportExport\Services\Vanille\Support\SupplierPriceProfile;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class SupplierPriceProfileTest extends TestCase
{
    #[Test]
    public function detects_lagdos_signature(): void
    {
        $rows = [
            [null, 'Прайс-лист 28.07.2026'],
            ['Код', 'Название', 'Цена', 'Заказ'],
            ['76960', '100 Bon AMBRE SENSUEL (U) edT 50 ml. TESTER', 13.1],
        ];

        $this->assertSame(SupplierPriceProfile::CODE_LAGDOS, SupplierPriceProfile::detectSignature($rows));

        $profile = SupplierPriceProfile::fromCode('lagdos');
        $profile->assertFileMatchesSignature($rows);
    }

    #[Test]
    public function rejects_lagdos_file_for_edp_profile(): void
    {
        $rows = [
            [null, 'Прайс-лист 28.07.2026'],
            ['Код', 'Название', 'Цена', 'Заказ'],
            ['76960', 'Title', 13.1],
        ];

        $this->expectException(\InvalidArgumentException::class);
        SupplierPriceProfile::fromCode('edp')->assertFileMatchesSignature($rows);
    }

    #[Test]
    public function detects_edp_signature(): void
    {
        $rows = [
            ['Код', 'Название', 'Цена'],
            ['100', 'Brand Name edP 100 ml', 10],
        ];

        $this->assertSame(SupplierPriceProfile::CODE_EDP, SupplierPriceProfile::detectSignature($rows));
        SupplierPriceProfile::fromCode('edp')->assertFileMatchesSignature($rows);
    }

    #[Test]
    public function lagdos_ignore_tokens_strip_packaging_noise(): void
    {
        $matcher = app(SellerOneVariantMatcher::class);
        $profile = SupplierPriceProfile::fromCode('lagdos');
        $sig = $matcher->parseVariantFromTail(
            'edP 100 ml. wooden box',
            $profile->ignoreExtraTokenPatterns(),
        );

        $this->assertSame('edp', $sig['concentration']);
        $this->assertSame(100.0, $sig['volume']);
        $this->assertSame([], $sig['extra_tokens']);
    }

    #[Test]
    public function lagdos_sample_title_splits_name_and_variant_tail(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $title = '19-69 INVISIBLE POST (U) edP 100 ml. TESTER';

        $split = $matcher->splitNameAndVariantTail($title);
        $this->assertSame('19-69 INVISIBLE POST (U)', $split['name']);
        $this->assertSame('edP 100 ml. TESTER', $split['tail']);

        $extract = new \ReflectionMethod(SellerOneVariantMatcher::class, 'extractGenderMarker');
        $this->assertSame('u', $extract->invoke($matcher, $title));

        $sig = $matcher->parseVariantFromTail($split['tail']);
        $this->assertSame(100.0, $sig['volume']);
        $this->assertSame('edp', $sig['concentration']);
        $this->assertTrue($sig['is_tester']);
        $this->assertFalse($sig['is_vial']);
        $this->assertFalse($sig['is_miniature']);
        $this->assertSame([], $sig['extra_tokens']);
    }

    #[Test]
    public function small_volume_without_tester_word_is_vial(): void
    {
        $matcher = new SellerOneVariantMatcher();
        $sig = $matcher->parseVariantFromTail('edP 2 ml.');

        $this->assertSame(2.0, $sig['volume']);
        $this->assertSame('edp', $sig['concentration']);
        $this->assertFalse($sig['is_tester']);
        $this->assertTrue($sig['is_vial']);
    }

    #[Test]
    public function lagdos_ignore_list_does_not_contain_mini(): void
    {
        $patterns = SupplierPriceProfile::fromCode('lagdos')->ignoreExtraTokenPatterns();
        $this->assertNotContains('мини', $patterns);
        $this->assertNotContains('mini', $patterns);
    }

    #[Test]
    public function legacy_supplier_code_normalizes_to_edp(): void
    {
        $this->assertSame('edp', SupplierPriceProfile::normalizeCode('supplier-price-xls'));
        $profile = SupplierPriceProfile::fromCode('supplier-price-xls');
        $this->assertSame('edp', $profile->code);
        $this->assertSame('EDP', $profile->name);
    }
}
