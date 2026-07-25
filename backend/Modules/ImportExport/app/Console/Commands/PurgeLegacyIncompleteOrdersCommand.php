<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\ImportExport\Services\Legacy\LegacyRemoteMysqlClient;
use RuntimeException;
use Throwable;

/**
 * Удаляет у нас заказы, импортированные из OpenCart с order_status_id = 0 (брошенный checkout).
 */
class PurgeLegacyIncompleteOrdersCommand extends Command
{
    protected $signature = 'legacy:purge-incomplete-orders
        {--dry-run : Only show what would be deleted}
        {--chunk=200 : How many mapped legacy IDs to check per query}';

    protected $description = 'Delete local orders mapped from OpenCart incomplete carts (order_status_id = 0)';

    public function __construct(
        private readonly LegacyRemoteMysqlClient $legacyMysql,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $chunkSize = max(1, (int) $this->option('chunk'));

        try {
            $this->legacyMysql->ping();
        } catch (Throwable $e) {
            $this->error('Legacy DB unavailable: '.$e->getMessage());

            return self::FAILURE;
        }

        $mapRows = DB::table('legacy_map_orders')
            ->orderBy('legacy_order_id')
            ->get(['legacy_order_id', 'order_id']);

        if ($mapRows->isEmpty()) {
            $this->info('No legacy_map_orders rows.');

            return self::SUCCESS;
        }

        $checked = 0;
        $incompleteLegacyIds = [];
        $legacyIds = $mapRows->pluck('legacy_order_id')->map(static fn ($id): int => (int) $id)->all();

        foreach (array_chunk($legacyIds, $chunkSize) as $chunk) {
            $checked += count($chunk);
            $in = implode(',', array_map(static fn (int $id): int => $id, $chunk));
            $rows = $this->legacyMysql->select(
                "SELECT `order_id`, `order_status_id` FROM `oc_order` WHERE `order_id` IN ({$in}) AND `order_status_id` <= 0"
            );
            foreach ($rows as $row) {
                $incompleteLegacyIds[] = (int) ($row->order_id ?? 0);
            }
        }

        $incompleteLegacyIds = array_values(array_filter($incompleteLegacyIds, static fn (int $id): bool => $id > 0));
        if ($incompleteLegacyIds === []) {
            $this->info("Checked {$checked} mapped legacy order(s); none incomplete.");

            return self::SUCCESS;
        }

        $toDelete = $mapRows
            ->filter(static fn ($row): bool => in_array((int) $row->legacy_order_id, $incompleteLegacyIds, true))
            ->values();

        $this->warn(
            ($dryRun ? 'Dry-run: would delete' : 'Deleting').
            ' '.$toDelete->count().' local order(s) from incomplete OpenCart carts.'
        );

        $deletedOrders = 0;
        $deletedMaps = 0;
        $missingOrders = 0;

        foreach ($toDelete as $row) {
            $legacyOrderId = (int) $row->legacy_order_id;
            $orderId = $row->order_id !== null ? (int) $row->order_id : null;

            if ($dryRun) {
                $this->line("Would purge legacy_order_id={$legacyOrderId}, order_id=".($orderId ?? 'null'));
                $deletedMaps++;
                if ($orderId) {
                    $deletedOrders++;
                }
                continue;
            }

            try {
                DB::transaction(function () use ($legacyOrderId, $orderId, &$deletedOrders, &$deletedMaps, &$missingOrders): void {
                    if ($orderId !== null && $orderId > 0) {
                        if (! DB::table('orders')->where('id', $orderId)->exists()) {
                            $missingOrders++;
                        } else {
                            $this->deleteLocalOrder($orderId);
                            $deletedOrders++;
                        }
                    }

                    DB::table('legacy_map_orders')->where('legacy_order_id', $legacyOrderId)->delete();
                    $deletedMaps++;
                });
            } catch (Throwable $e) {
                report($e);
                $this->error("Failed legacy_order_id={$legacyOrderId}: ".$e->getMessage());
            }
        }

        $this->info('Purge finished.');
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Checked mapped: {$checked}");
        $this->line('Incomplete on legacy: '.count($incompleteLegacyIds));
        $this->line("Deleted/would-delete orders: {$deletedOrders}");
        $this->line("Deleted/would-delete map rows: {$deletedMaps}");
        $this->line("Missing local orders: {$missingOrders}");

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
