<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Vanille\VanilleImportService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

class VanilleImportFileSelectionTest extends TestCase
{
    public function test_batch_files_are_sorted_by_numeric_suffix(): void
    {
        $files = [
            '/tmp/products_1000.json',
            '/tmp/products_101.json',
            '/tmp/products_100.json',
            '/tmp/products_999.json',
        ];

        $this->assertSame([
            '/tmp/products_100.json',
            '/tmp/products_101.json',
            '/tmp/products_999.json',
            '/tmp/products_1000.json',
        ], $this->invoke('sortParsedProductFiles', [$files]));
    }

    public function test_new_only_filter_keeps_parsed_but_not_imported_url(): void
    {
        $importedUrl = 'https://vanille.by/already-imported';
        $parsedOnlyUrl = 'https://vanille.by/parsed-only';

        $filtered = $this->invoke('filterUnimportedProductLinks', [
            [
                ['url' => $importedUrl],
                ['url' => $parsedOnlyUrl],
            ],
            [$importedUrl => true],
        ]);

        $this->assertSame([['url' => $parsedOnlyUrl]], $filtered);
    }

    private function invoke(string $methodName, array $arguments): mixed
    {
        $reflection = new ReflectionClass(VanilleImportService::class);
        $service = $reflection->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VanilleImportService::class, $methodName);

        return $method->invokeArgs($service, $arguments);
    }
}
