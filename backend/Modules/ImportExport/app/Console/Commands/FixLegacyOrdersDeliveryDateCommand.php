<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixLegacyOrdersDeliveryDateCommand extends Command
{
    protected $signature = 'legacy:fix-delivery-dates
        {--dry-run : Only count rows that would be updated}';

    protected $description = 'Set shipment_date = DATE(created_at) for legacy-imported orders where shipment_date is null';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $query = DB::table('orders')
            ->whereNull('shipment_date')
            ->whereIn('id', function ($q): void {
                $q->select('order_id')
                    ->from('legacy_map_orders')
                    ->whereNotNull('order_id');
            });

        $count = (clone $query)->count();
        if ($count === 0) {
            $this->info('Nothing to fix: no legacy orders with empty shipment_date.');

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->warn("Dry-run: would update {$count} order(s).");

            return self::SUCCESS;
        }

        $updated = $query->update([
            'shipment_date' => DB::raw('DATE(created_at)'),
            'updated_at' => now(),
        ]);

        $this->info("Updated shipment_date for {$updated} legacy order(s).");

        return self::SUCCESS;
    }
}
