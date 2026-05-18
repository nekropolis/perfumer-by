<?php

namespace Modules\Users\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class MigrateUserNameToFirstNameCommand extends Command
{
    protected $signature = 'users:migrate-name-to-first-name
        {--dry-run : Only show what would be updated}';

    protected $description = 'Copy users.name into users.first_name when first_name is empty';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $rows = DB::table('users')
            ->where(function ($query) {
                $query
                    ->whereNull('first_name')
                    ->orWhere('first_name', '=', '');
            })
            ->whereNotNull('name')
            ->where('name', '!=', '')
            ->where('name', '!=', 'Пользователь')
            ->orderBy('id')
            ->get(['id', 'name', 'first_name']);

        $processed = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($rows as $row) {
            $processed++;
            $id = (int) $row->id;
            $name = trim((string) $row->name);

            if ($name === '' || $name === 'Пользователь') {
                $skipped++;
                continue;
            }

            if ($dryRun) {
                $this->line("Would update user_id={$id}: first_name=\"{$name}\" (from name)");
                $updated++;
                continue;
            }

            DB::table('users')->where('id', $id)->update([
                'first_name' => $name,
                'updated_at' => now(),
            ]);
            $updated++;
        }

        $this->info('Migrate name → first_name finished.');
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Candidates: {$processed}");
        $this->line("Updated: {$updated}");
        $this->line("Skipped: {$skipped}");

        return self::SUCCESS;
    }
}
