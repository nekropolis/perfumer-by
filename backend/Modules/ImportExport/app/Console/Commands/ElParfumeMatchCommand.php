<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\ImportExport\Support\ElParfume\ElParfumeMatcher;
use Modules\ImportExport\Support\ElParfume\ElParfumeNormalizer;

class ElParfumeMatchCommand extends Command
{
    private const REDIRECT_COLUMNS = [
        'old_path',
        'type',
        'old_id',
        'url_form',
        'target',
        'method',
        'decision',
        'score',
        'slug_score',
        'name_score',
        'old_name',
        'our_id',
        'our_name',
        'cand2',
        'cand3',
        'gsc_impressions',
        'note',
    ];

    private const UNMATCHED_COLUMNS = [
        'old_path',
        'type',
        'old_id',
        'url_form',
        'target',
        'method',
        'decision',
        'score',
        'old_name',
        'our_id',
        'our_name',
        'gsc_impressions',
        'note',
        'cand1',
        'cand2',
        'cand3',
    ];

    protected $signature = 'elparfume:match
        {--in=storage/app/elparfume/old_urls.csv : Input URL CSV}
        {--out=storage/app/elparfume/redirect_map.csv : Redirect map CSV}
        {--unmatched=storage/app/elparfume/unmatched.csv : Review and fallback rows}
        {--synonyms=storage/app/elparfume/brand_synonyms.csv : Optional old,our_slug brand map}
        {--overrides=storage/app/elparfume/manual_overrides.csv : Optional old_path,target overrides}';

    protected $description = 'Match el-parfume.by URLs to perfumer.by redirect targets';

    public function handle(): int
    {
        $inPath = $this->resolvePath((string) $this->option('in'));
        $outPath = $this->resolvePath((string) $this->option('out'));
        $unmatchedPath = $this->resolvePath((string) $this->option('unmatched'));
        $synonymsPath = $this->resolvePath((string) $this->option('synonyms'));
        $overridesPath = $this->resolvePath((string) $this->option('overrides'));

        if (! is_file($inPath)) {
            $this->error("Input CSV not found: {$inPath}");

            return self::FAILURE;
        }
        if (! Schema::hasTable('brands') || ! Schema::hasTable('products')) {
            $this->error('brands and products tables are required');

            return self::FAILURE;
        }

        $input = $this->readCsv($inPath);
        $normalizer = new ElParfumeNormalizer();
        $matcher = new ElParfumeMatcher(
            $normalizer,
            $this->loadBrands(),
            $this->loadProducts(),
            $this->loadSynonyms($synonymsPath, $normalizer),
            $this->loadOverrides($overridesPath),
            $this->loadActiveSlugs('cms_pages'),
            $this->loadActiveSlugs('cms_posts'),
        );

        $matched = $matcher->match($input);
        $this->writeCsv($outPath, self::REDIRECT_COLUMNS, $matched);
        $this->writeCsv($unmatchedPath, self::UNMATCHED_COLUMNS, $matcher->unmatched($matched));
        $this->printSummary($matched);

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
     * @return list<array{id:int,name:string,slug:string,is_active:bool}>
     */
    private function loadBrands(): array
    {
        $rows = [];
        foreach (DB::table('brands')->get(['id', 'name', 'slug', 'is_active']) as $brand) {
            $rows[] = [
                'id' => (int) $brand->id,
                'name' => (string) $brand->name,
                'slug' => (string) $brand->slug,
                'is_active' => $this->isActive($brand->is_active),
            ];
        }

        return $rows;
    }

    /**
     * @return list<array{id:int,brand_id:int,name:string,slug:string,is_active:bool}>
     */
    private function loadProducts(): array
    {
        $rows = [];
        foreach (DB::table('products')->get(['id', 'brand_id', 'name', 'slug', 'is_active']) as $product) {
            $rows[] = [
                'id' => (int) $product->id,
                'brand_id' => (int) $product->brand_id,
                'name' => (string) $product->name,
                'slug' => (string) $product->slug,
                'is_active' => $this->isActive($product->is_active),
            ];
        }

        return $rows;
    }

    /**
     * @return array<string, true>|null
     */
    private function loadActiveSlugs(string $table): ?array
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'slug')) {
            return null;
        }

        $query = DB::table($table);
        if (Schema::hasColumn($table, 'is_active')) {
            $query->where('is_active', 1);
        }

        $slugs = [];
        foreach ($query->pluck('slug') as $slug) {
            $slug = trim((string) $slug);
            if ($slug !== '') {
                $slugs[$slug] = true;
            }
        }

        return $slugs;
    }

    /**
     * @return array<string, string>
     */
    private function loadSynonyms(string $path, ElParfumeNormalizer $normalizer): array
    {
        if (! is_file($path)) {
            return [];
        }

        $map = [];
        foreach ($this->readCsv($path) as $row) {
            $old = trim((string) ($row['old'] ?? ''));
            $slug = trim((string) ($row['our_slug'] ?? ''));
            if ($old === '' || $slug === '') {
                continue;
            }
            $map[mb_strtolower($old, 'UTF-8')] = $slug;
            $norm = $normalizer->normalize($old);
            if ($norm['sorted'] !== '') {
                $map[$norm['sorted']] = $slug;
            }
            if ($norm['compact'] !== '') {
                $map[$norm['compact']] = $slug;
            }
            $stripped = $normalizer->stripTrailingIdSuffix($old);
            if ($stripped !== $old) {
                $map[mb_strtolower($stripped, 'UTF-8')] = $slug;
                $strippedNorm = $normalizer->normalize($stripped);
                if ($strippedNorm['sorted'] !== '') {
                    $map[$strippedNorm['sorted']] = $slug;
                }
                if ($strippedNorm['compact'] !== '') {
                    $map[$strippedNorm['compact']] = $slug;
                }
            }
        }

        return $map;
    }

    /**
     * @return array<string, string>
     */
    private function loadOverrides(string $path): array
    {
        if (! is_file($path)) {
            return [];
        }

        $map = [];
        foreach ($this->readCsv($path) as $row) {
            $oldPath = trim((string) ($row['old_path'] ?? ''));
            $target = trim((string) ($row['target'] ?? ''));
            if ($oldPath === '' || $target === '') {
                continue;
            }
            $map[$oldPath] = $target;
        }

        return $map;
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

    /**
     * @param  list<string>  $columns
     * @param  list<array<string, mixed>>  $rows
     */
    private function writeCsv(string $path, array $columns, array $rows): void
    {
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $handle = fopen($path, 'wb');
        if (! $handle) {
            throw new \RuntimeException("Cannot write CSV: {$path}");
        }

        fputcsv($handle, $columns);
        foreach ($rows as $row) {
            $line = [];
            foreach ($columns as $column) {
                $line[] = (string) ($row[$column] ?? '');
            }
            fputcsv($handle, $line);
        }

        fclose($handle);
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function printSummary(array $rows): void
    {
        $counts = [];
        $impressionsByDecision = [];
        $totalImpressions = 0;
        foreach ($rows as $row) {
            $type = (string) $row['type'];
            $decision = (string) $row['decision'];
            $counts[$type][$decision] = ($counts[$type][$decision] ?? 0) + 1;
            $impressions = (int) $row['gsc_impressions'];
            $impressionsByDecision[$decision] = ($impressionsByDecision[$decision] ?? 0) + $impressions;
            $totalImpressions += $impressions;
        }

        ksort($counts);
        $table = [];
        foreach ($counts as $type => $decisions) {
            ksort($decisions);
            foreach ($decisions as $decision => $count) {
                $table[] = [$type, $decision, (string) $count];
            }
        }

        $shareRows = [];
        ksort($impressionsByDecision);
        foreach ($impressionsByDecision as $decision => $impressions) {
            $share = $totalImpressions === 0 ? 0.0 : ($impressions / $totalImpressions) * 100;
            $shareRows[] = [$decision, (string) $impressions, sprintf('%.1f%%', $share)];
        }

        $this->info('el-parfume URL match finished.');
        $this->line('Rows: '.count($rows));
        $this->table(['type', 'decision', 'rows'], $table);
        $this->line('Impressions-weighted share:');
        $this->table(['decision', 'impressions', 'share'], $shareRows);
    }

    private function isActive(mixed $value): bool
    {
        return $value === true || $value === 1 || $value === '1';
    }
}
