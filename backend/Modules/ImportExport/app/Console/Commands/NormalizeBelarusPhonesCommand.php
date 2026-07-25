<?php

namespace Modules\ImportExport\Console\Commands;

use App\Support\Phone;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NormalizeBelarusPhonesCommand extends Command
{
    protected $signature = 'phones:normalize-belarus
        {--dry-run : Only show what would be updated}
        {--staff : Also normalize users.phone}';

    protected $description = 'Apply BY phone rules: 80XXXXXXXXX→375… and 9 digits→375… (clients, orders)';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $this->normalizeTable('clients', $dryRun, unique: true);
        $this->normalizeTable('orders', $dryRun, unique: false);
        if ((bool) $this->option('staff')) {
            $this->normalizeTable('users', $dryRun, unique: true);
        }

        return self::SUCCESS;
    }

    private function normalizeTable(string $table, bool $dryRun, bool $unique): void
    {
        $rows = DB::table($table)
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->orderBy('id')
            ->get(['id', 'phone']);

        $processed = 0;
        $updated = 0;
        $unchanged = 0;
        $conflicts = 0;
        $empty = 0;

        foreach ($rows as $row) {
            $processed++;
            $id = (int) $row->id;
            $raw = (string) $row->phone;
            $normalized = Phone::normalizeBelarusDigits($raw);

            if ($normalized === '') {
                $empty++;
                continue;
            }

            if ($normalized === $raw) {
                $unchanged++;
                continue;
            }

            if ($unique) {
                $exists = DB::table($table)
                    ->where('id', '!=', $id)
                    ->where('phone', $normalized)
                    ->exists();
                if ($exists) {
                    $conflicts++;
                    $this->warn("Conflict: {$table} id={$id}, {$raw} -> {$normalized} already exists");
                    continue;
                }
            }

            if (! $dryRun) {
                DB::table($table)->where('id', $id)->update([
                    'phone' => $normalized,
                    'updated_at' => now(),
                ]);
            }
            $updated++;
        }

        $this->info("{$table}: BY phone normalization finished.");
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Processed: {$processed}");
        $this->line("Updated: {$updated}");
        $this->line("Unchanged: {$unchanged}");
        $this->line("Conflicts: {$conflicts}");
        $this->line("Empty after normalize: {$empty}");
        $this->newLine();
    }
}
