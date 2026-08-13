<?php

namespace Tests\Unit;

use Modules\Warehouse\Services\StockInventoryService;
use Modules\Warehouse\Services\StockReceiptPreorderDistributionService;
use Modules\Warehouse\Services\StockReceiptService;
use ReflectionMethod;
use Tests\TestCase;

class StockReceiptPreorderDistributionServiceTest extends TestCase
{
    public function test_allocate_from_receipt_lots_returns_null_when_no_lots(): void
    {
        $service = new StockReceiptPreorderDistributionService(
            $this->createMock(StockReceiptService::class),
            $this->createMock(StockInventoryService::class),
        );

        $method = new ReflectionMethod(StockReceiptPreorderDistributionService::class, 'allocateFromReceiptLots');
        $method->setAccessible(true);

        self::assertNull($method->invoke($service, [], 1));
        self::assertNull($method->invoke($service, [1], 0));
    }
}
