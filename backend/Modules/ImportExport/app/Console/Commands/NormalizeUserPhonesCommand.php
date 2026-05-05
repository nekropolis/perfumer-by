<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NormalizeUserPhonesCommand extends Command
{
    protected $signature = 'legacy:normalize-user-phones
        {--dry-run : Only show what would be updated}';

    protected $description = 'Normalize users.phone to digits only (remove + and non-digit chars)';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $rows = DB::table('users')
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

            $exists = DB::table('users')
                ->where('id', '!=', $id)
                ->where('phone', $normalized)
                ->exists();
            if ($exists) {
                $conflicts++;
                $this->warn("Conflict: user_id={$id}, {$rawPhone} -> {$normalized} already exists");
                continue;
            }

            if (! $dryRun) {
                DB::table('users')->where('id', $id)->update([
                    'phone' => $normalized,
                    'updated_at' => now(),
                ]);
            }
            $updated++;
        }

        $this->info('Users phone normalization finished.');
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Processed: {$processed}");
        $this->line("Updated: {$updated}");
        $this->line("Unchanged: {$unchanged}");
        $this->line("Conflicts: {$conflicts}");
        $this->line("Empty after normalize: {$emptyAfterNormalize}");

        return self::SUCCESS;
    }
}

