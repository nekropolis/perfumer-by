<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Allparfume\AllparfumeIdFileImportService;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class AllparfumeIdFileImportServiceTest extends TestCase
{
    public function test_it_parses_allparfume_paths(): void
    {
        $parse = $this->method('parseAllparfumePath');

        $this->assertSame(
            ['brand_slug' => 'christian_dior', 'external_slug' => 'sauvage'],
            $parse('/christian_dior/sauvage.html'),
        );
        $this->assertSame(
            ['brand_slug' => 'christian_dior', 'external_slug' => 'sauvage'],
            $parse('/christian_dior/sauvage.'),
        );
        $this->assertSame(
            ['brand_slug' => 'christian_dior', 'external_slug' => 'sauvage'],
            $parse('https://allparfume.by/christian_dior/sauvage.html?x=1'),
        );
    }

    public function test_it_parses_perfumer_slug(): void
    {
        $parse = $this->method('pathToSlug');

        $this->assertSame('dior-sauvage', $parse('/dior-sauvage'));
        $this->assertSame('dior-sauvage', $parse('https://perfumer.by/dior-sauvage'));
    }

    public function test_it_normalizes_perfumer_url_string_or_list(): void
    {
        $this->assertSame(
            ['https://perfumer.by/chanel-pour-monsieur'],
            AllparfumeIdFileImportService::normalizePerfumerUrls('https://perfumer.by/chanel-pour-monsieur'),
        );
        $this->assertSame(
            [
                'https://perfumer.by/chanel-pour-monsieur',
                'https://perfumer.by/chanel-pour-monsieur-eau-de-toilette',
            ],
            AllparfumeIdFileImportService::normalizePerfumerUrls([
                'https://perfumer.by/chanel-pour-monsieur',
                'https://perfumer.by/chanel-pour-monsieur-eau-de-toilette',
            ]),
        );
        $this->assertSame([], AllparfumeIdFileImportService::normalizePerfumerUrls([]));
        $this->assertSame([], AllparfumeIdFileImportService::normalizePerfumerUrls(['https://ok', 1]));
    }

    public function test_it_normalizes_item_with_perfumer_url_list(): void
    {
        $service = new AllparfumeIdFileImportService();
        $method = new ReflectionMethod($service, 'normalizeItem');
        $row = $method->invoke($service, [
            'perfumer_url' => [
                'https://perfumer.by/chanel-pour-monsieur',
                'https://perfumer.by/chanel-pour-monsieur-eau-de-toilette',
            ],
            'allparfume_url' => 'https://allparfume.by/chanel/pour_monsieur.html',
            'allparfume_id' => 695,
        ]);

        $this->assertSame([
            'chanel-pour-monsieur',
            'chanel-pour-monsieur-eau-de-toilette',
        ], $row['slugs']);
        $this->assertSame(695, $row['allparfume_id']);
        $this->assertSame('chanel', $row['brand_slug']);
        $this->assertSame('pour_monsieur', $row['external_slug']);
    }

    private function method(string $name): callable
    {
        $service = new AllparfumeIdFileImportService();
        $method = new ReflectionMethod($service, $name);

        return static fn (string $url) => $method->invoke($service, $url);
    }
}
