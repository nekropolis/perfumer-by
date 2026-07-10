<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Mockery;
use Modules\Catalog\Jobs\RunSellerOneParseJob;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePreviewSyncService;
use Modules\Warehouse\Services\StockInventoryService;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

class SellerOneParseRegressionTest extends TestCase
{
    public function test_linked_rows_batch_uses_update_without_touching_external_url(): void
    {
        $capturedSql = '';
        $capturedBindings = [];
        DB::shouldReceive('update')
            ->once()
            ->withArgs(function (string $sql, array $bindings) use (&$capturedSql, &$capturedBindings): bool {
                $capturedSql = $sql;
                $capturedBindings = $bindings;

                return true;
            })
            ->andReturn(2);

        $service = new SellerOnePreviewSyncService(
            Mockery::mock(StockInventoryService::class),
        );

        $updated = $service->touchLinkedSupplierRowsBatchFromRecords(1, [
            [
                'id' => 101,
                'external_url' => 'supplier-xls://first',
                'is_linked' => true,
                'external_name' => 'First',
                'payload' => ['linked_variant_id' => 10],
            ],
            [
                'id' => 102,
                'external_url' => 'supplier-xls://second',
                'is_linked' => true,
                'external_name' => 'Second',
                'payload' => ['linked_variant_id' => 11],
            ],
        ], [
            ['code' => 'first', 'title' => 'First updated', 'supplier_price' => 11.25],
            ['code' => 'second', 'title' => 'Second updated', 'supplier_price' => 12.5],
        ]);

        self::assertSame(2, $updated);
        self::assertStringStartsWith('UPDATE supplier_products SET ', $capturedSql);
        self::assertStringNotContainsString('INSERT', $capturedSql);
        self::assertStringNotContainsString('external_url', $capturedSql);
        self::assertStringContainsString('WHERE supplier_id = ? AND id IN (?, ?)', $capturedSql);
        self::assertNotContains('supplier-xls://first', $capturedBindings);
        self::assertNotContains('supplier-xls://second', $capturedBindings);
        self::assertContains(1, $capturedBindings);
        self::assertContains(101, $capturedBindings);
        self::assertContains(102, $capturedBindings);
    }

    public function test_supplier_product_index_round_trip_preserves_latest_state(): void
    {
        $jobId = 'seller-one-index-'.uniqid();
        $service = (new ReflectionClass(SupplierPriceImportService::class))->newInstanceWithoutConstructor();
        $persist = new ReflectionMethod(SupplierPriceImportService::class, 'persistSupplierProductIndex');
        $restore = new ReflectionMethod(SupplierPriceImportService::class, 'restoreSupplierProductIndex');
        $remove = new ReflectionMethod(SupplierPriceImportService::class, 'removeSupplierProductIndexCache');

        $index = [
            'supplier-xls://100' => [
                'id' => 100,
                'external_url' => 'supplier-xls://100',
                'is_linked' => true,
                'external_name' => 'Updated product',
                'payload' => ['linked_variant_id' => 500, 'supplier_price' => 45.5],
            ],
        ];

        try {
            $persist->invoke($service, $jobId, $index);

            self::assertSame($index, $restore->invoke($service, $jobId));
        } finally {
            $remove->invoke($service, $jobId);
        }
    }

    public function test_progress_publication_preserves_cumulative_parse_counters(): void
    {
        $jobId = 'seller-one-progress-'.uniqid();
        $cacheKey = RunSellerOneParseJob::cacheKey($jobId);
        Cache::put($cacheKey, [
            'job_id' => $jobId,
            'status' => 'queued',
            'processed' => 0,
            'total_rows' => 0,
            'matched' => 0,
            'inserted' => 0,
            'updated' => 0,
            'skipped_linked' => 0,
            'skipped_parsing_inactive' => 0,
            'skipped_skip_marker' => 0,
        ], now()->addHour());

        try {
            RunSellerOneParseJob::publishParseProgress($cacheKey, $jobId, [
                'processed' => 200,
                'total_rows' => 500,
                'matched' => 90,
                'inserted' => 50,
                'updated' => 30,
                'skipped_linked' => 20,
                'skipped_parsing_inactive' => 5,
                'skipped_skip_marker' => 5,
            ]);
            RunSellerOneParseJob::publishParseProgress($cacheKey, $jobId, [
                'processed' => 400,
                'total_rows' => 500,
                'matched' => 180,
                'updated' => 70,
            ]);

            self::assertSame([
                'processed' => 400,
                'total_rows' => 500,
                'matched' => 180,
                'inserted' => 50,
                'updated' => 70,
                'skipped_linked' => 20,
                'skipped_parsing_inactive' => 5,
                'skipped_skip_marker' => 5,
            ], collect(Cache::get($cacheKey))->only([
                'processed',
                'total_rows',
                'matched',
                'inserted',
                'updated',
                'skipped_linked',
                'skipped_parsing_inactive',
                'skipped_skip_marker',
            ])->all());
        } finally {
            Cache::forget($cacheKey);
        }
    }
}
