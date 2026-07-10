<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NormalizeUserPhonesCommand extends Command
{
    protected $signature = 'legacy:normalize-user-phones
        {--dry-run : Only show what would be updated}
        {--staff : Also normalize users.phone for staff}';

    protected $description = 'Normalize clients.phone to digits only';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $includeStaff = (bool) $this->option('staff');

        $this->normalizeTablePhones('clients', $dryRun);
        if ($includeStaff) {
            $this->normalizeTablePhones('users', $dryRun);
        }

        return self::SUCCESS;
    }

    private function normalizeTablePhones(string $table, bool $dryRun): void
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

            $exists = DB::table($table)
                ->where('id', '!=', $id)
                ->where('phone', $normalized)
                ->exists();
            if ($exists) {
                $conflicts++;
                $this->warn("Conflict: {$table} id={$id}, {$rawPhone} -> {$normalized} already exists");
                continue;
            }

            if (! $dryRun) {
                DB::table($table)->where('id', $id)->update([
                    'phone' => $normalized,
                    'updated_at' => now(),
                ]);
            }
            $updated++;
        }

        $this->info("{$table} phone normalization finished.");
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Processed: {$processed}");
        $this->line("Updated: {$updated}");
        $this->line("Unchanged: {$unchanged}");
        $this->line("Conflicts: {$conflicts}");
        $this->line("Empty after normalize: {$emptyAfterNormalize}");
    }
}
