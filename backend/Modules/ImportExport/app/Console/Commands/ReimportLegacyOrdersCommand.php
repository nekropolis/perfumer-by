<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\ImportExport\Services\Legacy\LegacyOrdersImportService;
use Modules\ImportExport\Services\Legacy\LegacyRemoteMysqlClient;
use RuntimeException;
use Throwable;

class ReimportLegacyOrdersCommand extends Command
{
    protected $signature = 'legacy:reimport-orders
        {--from=2026-07-23 : Legacy date_added from (Y-m-d, inclusive)}
        {--dry-run : Only show what would be deleted/reimported}
        {--chunk=200 : Batch size for legacy ID queries}';

    protected $description = 'Delete and reimport confirmed OpenCart orders from a date (options → manager_comment, discount card)';

    public function __construct(
        private readonly LegacyRemoteMysqlClient $legacyMysql,
        private readonly LegacyOrdersImportService $ordersImport,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $from = trim((string) $this->option('from'));
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) !== 1) {
            $this->error('Invalid --from date, expected Y-m-d');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $chunkSize = max(1, (int) $this->option('chunk'));

        try {
            $this->legacyMysql->ping();
        } catch (Throwable $e) {
            $this->error('Legacy DB unavailable: '.$e->getMessage());

            return self::FAILURE;
        }

        $fromSql = $from.' 00:00:00';
        $legacyOrders = $this->legacyMysql->select(
            "SELECT `order_id` FROM `oc_order` WHERE `order_status_id` > 0"
            ." AND `date_added` >= '".str_replace("'", "''", $fromSql)."'"
            .' ORDER BY `order_id`'
        );

        $legacyIds = $legacyOrders
            ->pluck('order_id')
            ->map(static fn ($id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->values()
            ->all();

        if ($legacyIds === []) {
            $this->info("No confirmed legacy orders since {$from}.");

            return self::SUCCESS;
        }

        $this->info('Legacy orders to reimport: '.count($legacyIds));

        $mapByLegacy = DB::table('legacy_map_orders')
            ->whereIn('legacy_order_id', $legacyIds)
            ->get(['legacy_order_id', 'order_id'])
            ->keyBy('legacy_order_id');

        $deletedOrders = 0;
        $deletedMaps = 0;

        foreach (array_chunk($legacyIds, $chunkSize) as $chunk) {
            foreach ($chunk as $legacyOrderId) {
                $map = $mapByLegacy->get($legacyOrderId);
                $orderId = $map && $map->order_id !== null ? (int) $map->order_id : null;

                if ($dryRun) {
                    $this->line(
                        "Would purge legacy_order_id={$legacyOrderId}, order_id=".($orderId ?? 'null')
                    );
                    if ($orderId) {
                        $deletedOrders++;
                    }
                    if ($map) {
                        $deletedMaps++;
                    }
                    continue;
                }

                try {
                    DB::transaction(function () use ($legacyOrderId, $orderId, &$deletedOrders, &$deletedMaps): void {
                        if ($orderId !== null && $orderId > 0 && DB::table('orders')->where('id', $orderId)->exists()) {
                            $this->deleteLocalOrder($orderId);
                            $deletedOrders++;
                        }
                        $removed = DB::table('legacy_map_orders')->where('legacy_order_id', $legacyOrderId)->delete();
                        if ($removed > 0) {
                            $deletedMaps++;
                        }
                    });
                } catch (Throwable $e) {
                    report($e);
                    $this->error("Purge failed legacy_order_id={$legacyOrderId}: ".$e->getMessage());
                }
            }
        }

        if ($dryRun) {
            $this->warn("Dry-run: would delete orders={$deletedOrders}, maps={$deletedMaps}; skip import.");

            return self::SUCCESS;
        }

        $this->info("Deleted orders={$deletedOrders}, maps={$deletedMaps}. Importing…");
        $stats = $this->ordersImport->importLegacyOrderIds($legacyIds);

        $this->info('Reimport finished.');
        $this->line("Fetched: {$stats['fetched']}");
        $this->line("Imported: {$stats['imported']}");
        $this->line("Skipped: {$stats['skipped']}");
        $this->line("Failed: {$stats['failed']}");
        $this->line("Card matched: {$stats['card_matched']}");
        $this->line("With manager_comment: {$stats['with_manager_comment']}");

        return self::SUCCESS;
    }

    private function deleteLocalOrder(int $orderId): void
    {
        DB::table('order_items')->where('order_id', $orderId)->delete();

        if (DB::getSchemaBuilder()->hasTable('order_order_tag')) {
            DB::table('order_order_tag')->where('order_id', $orderId)->delete();
        }
        if (DB::getSchemaBuilder()->hasTable('order_gift_certificates')) {
            DB::table('order_gift_certificates')->where('order_id', $orderId)->delete();
        }
        if (DB::getSchemaBuilder()->hasTable('order_gift_certificate_purchases')) {
            DB::table('order_gift_certificate_purchases')->where('order_id', $orderId)->delete();
        }

        $deleted = DB::table('orders')->where('id', $orderId)->delete();
        if ($deleted === 0) {
            throw new RuntimeException("Order #{$orderId} was not deleted");
        }
    }
}
