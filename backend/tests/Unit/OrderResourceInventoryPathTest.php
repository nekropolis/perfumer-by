<?php

namespace Tests\Unit;

use Modules\Checkout\Http\Resources\OrderResource;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OrderResourceInventoryPathTest extends TestCase
{
    #[DataProvider('pathProvider')]
    public function test_inventory_payload_only_for_admin_order_id_routes(string $path, bool $expected): void
    {
        $this->assertSame($expected, OrderResource::shouldIncludeInventoryForPath($path));
    }

    public static function pathProvider(): array
    {
        return [
            'list' => ['admin/orders', false],
            'list with prefix' => ['api/admin/orders', false],
            'stats' => ['admin/orders/stats', false],
            'show' => ['admin/orders/42', true],
            'status' => ['admin/orders/42/status', true],
            'admin-fields' => ['admin/orders/42/admin-fields', true],
            'checkout' => ['checkout', false],
            'account' => ['orders/42', false],
        ];
    }
}
