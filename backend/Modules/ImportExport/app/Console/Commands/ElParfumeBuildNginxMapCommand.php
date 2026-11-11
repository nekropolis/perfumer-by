<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Support\ElParfume\ElParfumeArtifactBackup;
use Modules\ImportExport\Support\ElParfume\ElParfumeNginxMapBuilder;

class ElParfumeBuildNginxMapCommand extends Command
{
    protected $signature = 'elparfume:build-nginx-map
        {--in=storage/app/elparfume/redirect_map.csv : Redirect map CSV}
        {--out-dir=storage/app/elparfume/nginx : Output directory for generated nginx configs}
        {--host=https://perfumer.by : Redirect target origin}';

    protected $description = 'Build nginx map and server example configs from el-parfume redirect_map.csv';

    public function handle(ElParfumeNginxMapBuilder $builder): int
    {
        $inPath = $this->resolvePath((string) $this->option('in'));
        $outDir = $this->resolvePath((string) $this->option('out-dir'));
        $host = (string) $this->option('host');

        if (! is_file($inPath)) {
            $this->error("Input CSV not found: {$inPath}");

            return self::FAILURE;
        }

        $rows = $this->readCsv($inPath);
        $result = $builder->build($rows, $host, '/etc/nginx/el-parfume.by.map.conf');

        if ($result['empty_targets'] > 0) {
            $this->error("Rows with empty target: {$result['empty_targets']} (must be 0)");

            return self::FAILURE;
        }

        if (! is_dir($outDir)) {
            mkdir($outDir, 0755, true);
        }

        $mapPath = $outDir.'/el-parfume.by.map.conf';
        $serverPath = $outDir.'/el-parfume.by.conf.example';

        foreach ([$mapPath, $serverPath] as $path) {
            $backup = ElParfumeArtifactBackup::backupIfExists($path);
            if ($backup !== null) {
                $this->line("Backed up: {$backup}");
            }
        }

        if (file_put_contents($mapPath, $result['map_conf']) === false) {
            $this->error("Cannot write: {$mapPath}");

            return self::FAILURE;
        }
        if (file_put_contents($serverPath, $result['server_conf']) === false) {
            $this->error("Cannot write: {$serverPath}");

            return self::FAILURE;
        }

        $this->info('el-parfume nginx map build finished.');
        $this->line("Map URI entries: {$result['uri_entries']}");
        $this->line("Map args entries: {$result['args_entries']}");
        if ($result['duplicates_skipped'] > 0) {
            $this->warn("Duplicate map keys skipped (lower priority): {$result['duplicates_skipped']}");
        }
        $this->line("Wrote: {$mapPath}");
        $this->line("Wrote: {$serverPath}");

        return self::SUCCESS;
    }

    private function resolvePath(string $path): string
    {
        $path = trim($path);
        if ($path === '' || $path[0] === DIRECTORY_SEPARATOR) {
            return $path;
        }

        return base_path($path);
    }

    /**
     * @return list<array<string, string>>
     */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'rb');
        if (! $handle) {
            throw new \RuntimeException("Cannot read CSV: {$path}");
        }

        $header = fgetcsv($handle);
        if (! is_array($header) || $header === []) {
            fclose($handle);

            return [];
        }
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]) ?? (string) $header[0];
        $header = array_map(static fn ($column): string => trim((string) $column), $header);
        $width = count($header);

        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            if (! is_array($row) || $row === [null] || $row === []) {
                continue;
            }
            $row = array_pad($row, $width, '');
            $assoc = array_combine($header, array_slice($row, 0, $width));
            if (! is_array($assoc)) {
                continue;
            }
            $normalized = [];
            foreach ($assoc as $key => $value) {
                $normalized[(string) $key] = trim((string) $value);
            }
            $rows[] = $normalized;
        }

        fclose($handle);

        return $rows;
    }
}
