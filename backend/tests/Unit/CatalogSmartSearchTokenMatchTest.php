<?php

namespace Tests\Unit;

use Modules\Catalog\Http\Controllers\Api\ProductController;
use Modules\Catalog\Support\CatalogSearchScoring;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

class CatalogSmartSearchTokenMatchTest extends TestCase
{
    private function controllerWithoutConstructor(): ProductController
    {
        return (new ReflectionClass(ProductController::class))->newInstanceWithoutConstructor();
    }

    private function invokeMatchInOrder(string $query, string $display): bool
    {
        $controller = $this->controllerWithoutConstructor();
        $matchInOrder = new ReflectionMethod($controller, 'smartSearchTokensMatchInOrder');
        $matchInOrder->setAccessible(true);

        $normalizedQuery = CatalogSearchScoring::normalizeSearchText($query);
        $tokens = array_values(array_filter(explode(' ', $normalizedQuery)));
        $normalizedDisplay = CatalogSearchScoring::normalizeSearchText($display);

        return (bool) $matchInOrder->invoke($controller, $tokens, $normalizedDisplay);
    }

    public function test_partial_brand_and_year_match_full_display_title(): void
    {
        $display = 'norana perfumes moon 1947 gold';

        $this->assertTrue($this->invokeMatchInOrder('Nor 1947', $display));
        $this->assertTrue($this->invokeMatchInOrder('Noran 1947', $display));
        $this->assertTrue($this->invokeMatchInOrder('Mo 1947', $display));
    }

    public function test_short_prefix_does_not_match_unrelated_words(): void
    {
        $controller = $this->controllerWithoutConstructor();
        $method = new ReflectionMethod($controller, 'smartSearchTokenMatchesDisplayWord');
        $method->setAccessible(true);

        $this->assertTrue($method->invoke($controller, 'mo', 'moon'));
        $this->assertFalse($method->invoke($controller, 'in', 'intense'));
    }
}
