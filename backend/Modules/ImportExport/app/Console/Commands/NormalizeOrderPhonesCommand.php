<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NormalizeOrderPhonesCommand extends Command
{
    protected $signature = 'legacy:normalize-order-phones
        {--dry-run : Only show what would be updated}';

    protected $description = 'Normalize orders.phone to digits only (remove + and non-digit chars)';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $rows = DB::table('orders')
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->orderBy('id')
            ->get(['id', 'phone']);

        $processed = 0;
        $updated = 0;
        $unchanged = 0;
        $emptyAfterNormalize = 0;

        foreach ($rows as $row) {
            $processed++;
            $id = (int) $row->id;
            $rawPhone = (string) $row->phone;
            $normalized = preg_replace('/\D+/', '', $rawPhone) ?? '';

            if ($normalized === '') {
                $emptyAfterNormalize++;
                continue;
            }

            if ($normalized === $rawPhone) {
                $unchanged++;
                continue;
            }

            if (! $dryRun) {
                DB::table('orders')->where('id', $id)->update([
                    'phone' => mb_substr($normalized, 0, 15),
                    'updated_at' => now(),
                ]);
            }
            $updated++;
        }

        $this->info('Orders phone normalization finished.');
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Processed: {$processed}");
        $this->line("Updated: {$updated}");
        $this->line("Unchanged: {$unchanged}");
        $this->line("Empty after normalize: {$emptyAfterNormalize}");

        return self::SUCCESS;
    }
}

