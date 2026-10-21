<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\ImportExport\Support\SeoRedirectCache;

class ImportGscMigrationRedirectsCommand extends Command
{
    protected $signature = 'seo:import-gsc-redirects
        {--file= : Path to JSON (default: module resources/gsc-migration-redirects.json)}
        {--dry-run : Show counts only, do not write}';

    protected $description = 'Upsert GSC migration seo_redirects (brands/categories/info + OpenCart index.php URLs)';

    public function handle(): int
    {
        $file = (string) ($this->option('file') ?: $this->defaultFile());
        $dryRun = (bool) $this->option('dry-run');

        if (! is_file($file)) {
            $this->error("File not found: {$file}");

            return self::FAILURE;
        }

        $decoded = json_decode((string) file_get_contents($file), true);
        if (! is_array($decoded)) {
            $this->error('Invalid JSON: expected array of {from_path,to_path,note}');

            return self::FAILURE;
        }

        $rows = [];
        foreach ($decoded as $i => $row) {
            if (! is_array($row)) {
                $this->error("Invalid row at index {$i}");

                return self::FAILURE;
            }
            $from = trim((string) ($row['from_path'] ?? ''));
            $to = trim((string) ($row['to_path'] ?? ''));
            $note = trim((string) ($row['note'] ?? 'gsc_migration'));
            if ($from === '' || $to === '' || ! str_starts_with($from, '/') || ! str_starts_with($to, '/')) {
                $this->error("Invalid from/to at index {$i}: {$from} -> {$to}");

                return self::FAILURE;
            }
            if ($from === $to) {
                $this->warn("Skip self-redirect: {$from}");

                continue;
            }
            $rows[$from] = ['to_path' => $to, 'note' => $note !== '' ? $note : 'gsc_migration'];
        }

        $this->info('Rows: '.count($rows).($dryRun ? ' (dry-run)' : ''));

        if ($dryRun) {
            foreach (array_slice(array_keys($rows), 0, 15) as $from) {
                $this->line("  {$from} -> {$rows[$from]['to_path']}");
            }
            if (count($rows) > 15) {
                $this->line('  …');
            }

            return self::SUCCESS;
        }

        $now = now();
        $inserted = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($rows as $from => $payload) {
            $to = $payload['to_path'];
            $note = $payload['note'];

            $existing = DB::table('seo_redirects')
                ->when(DB::getDriverName() === 'mysql', fn ($q) => $q->whereRaw('BINARY `from_path` = ?', [$from]))
                ->when(DB::getDriverName() !== 'mysql', fn ($q) => $q->where('from_path', $from))
                ->first();

            if ($existing) {
                if ((string) $existing->to_path === $to && (int) $existing->is_active === 1 && (int) $existing->http_code === 301) {
                    $skipped++;

                    continue;
                }

                DB::table('seo_redirects')->where('id', $existing->id)->update([
                    'to_path' => $to,
                    'http_code' => 301,
                    'is_active' => true,
                    'source' => 'gsc_migration',
                    'note' => $note,
                    'updated_at' => $now,
                ]);
                $updated++;

                continue;
            }

            DB::table('seo_redirects')->insert([
                'from_path' => $from,
                'to_path' => $to,
                'http_code' => 301,
                'is_active' => true,
                'source' => 'gsc_migration',
                'note' => $note,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $inserted++;
        }

        SeoRedirectCache::flush();

        $this->info("inserted={$inserted} updated={$updated} skipped={$skipped}");

        return self::SUCCESS;
    }

    private function defaultFile(): string
    {
        return dirname(__DIR__, 3).'/resources/gsc-migration-redirects.json';
    }
}
