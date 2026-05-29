<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\Support\VanilleParsedImportGuard;
use PHPUnit\Framework\TestCase;

class VanilleParsedImportGuardTest extends TestCase
{
    public function test_skips_category_without_offers(): void
    {
        $reason = VanilleParsedImportGuard::skipReason([
            'url' => 'https://vanille.by/probniki',
            'brand' => 'Пробники',
            'name' => 'Пробники',
            'offers' => [],
        ]);

        $this->assertNotNull($reason);
    }

    public function test_skips_without_offers_when_no_characteristics(): void
    {
        $reason = VanilleParsedImportGuard::skipReason([
            'url' => 'https://vanille.by/chanel-n5-test',
            'brand' => 'Chanel',
            'name' => 'Chanel N5 Test',
            'offers' => [],
            'characteristics' => [],
        ]);

        $this->assertNotNull($reason);
        $this->assertStringContainsString('характеристик', (string) $reason);
    }
}
