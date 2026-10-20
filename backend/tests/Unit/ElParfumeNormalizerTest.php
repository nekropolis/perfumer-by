<?php

namespace Tests\Unit;

use Modules\ImportExport\Support\ElParfume\ElParfumeNormalizer;
use PHPUnit\Framework\TestCase;

class ElParfumeNormalizerTest extends TestCase
{
    private ElParfumeNormalizer $normalizer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->normalizer = new ElParfumeNormalizer();
    }

    public function test_folds_cyrillic_diacritics_noise_and_keeps_gender(): void
    {
        $this->assertSame('elka', $this->normalizer->normalize('Ёлка')['compact']);
        $this->assertSame('lancome', $this->normalizer->normalize('Lancôme')['compact']);
        $this->assertSame('hloe', $this->normalizer->normalize('Khloe')['compact']);
        $this->assertSame('sauvage', $this->normalizer->normalize('Sauvage туалетная вода EDT 100 ml')['compact']);
        $this->assertSame('sauvage', $this->normalizer->normalize('Sauvage 100ml')['compact']);
        $this->assertSame('homme l', $this->normalizer->normalize("L'Homme EDT")['sorted']);
        $this->assertContains('homme', $this->normalizer->normalize("L'Homme")['tokens']);
        $this->assertSame('bleu chanel', $this->normalizer->normalize('Chanel Bleu')['sorted']);
    }

    public function test_strips_brand_id_and_category_gender_suffixes(): void
    {
        $this->assertSame('zara', $this->normalizer->stripTrailingIdSuffix('zara-462'));
        $this->assertSame('ed-hardy', $this->normalizer->stripTrailingIdSuffix('ed-hardy-249'));
        $this->assertSame('antonio-banderas', $this->normalizer->stripTrailingIdSuffix('antonio-banderas'));
        $this->assertSame('lalique', $this->normalizer->stripCategoryKeyword('lalique-myjskie'));
        $this->assertSame('antonio-banderas', $this->normalizer->stripCategoryKeyword('antonio-banderas-jenskie'));
        $this->assertSame('chloe', $this->normalizer->stripCategoryKeyword('chloe-w'));
        $this->assertSame('puma', $this->normalizer->stripCategoryKeyword('/man/puma-1833/'));
        $this->assertSame('women-secret', $this->normalizer->stripCategoryKeyword('women-secret'));
    }
}
