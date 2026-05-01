<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Brand;

class MapLegacyBrandsBySlugCommand extends Command
{
    protected $signature = 'legacy:map-brands-by-slug
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--dry-run : Do not write into legacy_map_brands table}
        {--truncate : Truncate legacy_map_brands before write}';

    protected $description = 'Map legacy manufacturers to current brands by slug only';

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $dryRun = (bool) $this->option('dry-run');
        $truncate = (bool) $this->option('truncate');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");
            return self::FAILURE;
        }

        $legacyManufacturerSlugs = $this->extractManufacturerSlugsFromDump($dumpPath);
        if (empty($legacyManufacturerSlugs)) {
            $this->warn('No manufacturer slugs found in oc_url_alias.');
            return self::SUCCESS;
        }

        $currentBrandsBySlug = Brand::query()
            ->whereNotNull('slug')
            ->pluck('id', 'slug')
            ->all();

        $rows = [];
        $matched = 0;
        $unmatched = 0;

        foreach ($legacyManufacturerSlugs as $legacyManufacturerId => $legacySlug) {
            $brandId = $currentBrandsBySlug[$legacySlug] ?? null;
            $isMatched = $brandId !== null;

            if ($isMatched) {
                $matched++;
            } else {
                $unmatched++;
            }

            $rows[] = [
                'legacy_manufacturer_id' => $legacyManufacturerId,
                'legacy_slug' => $legacySlug,
                'brand_id' => $brandId,
                'status' => $isMatched ? 'matched' : 'unmatched',
                'match_method' => 'slug_exact',
                'note' => $isMatched ? null : 'No current brand found with the same slug',
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        if (! $dryRun) {
            if ($truncate) {
                // TRUNCATE can trigger implicit commit on MySQL/MariaDB; keep it outside transaction.
                DB::table('legacy_map_brands')->truncate();
            }

            DB::transaction(function () use ($rows): void {
                DB::table('legacy_map_brands')->upsert(
                    $rows,
                    ['legacy_manufacturer_id'],
                    ['legacy_slug', 'brand_id', 'status', 'match_method', 'note', 'updated_at']
                );
            });
        }

        $total = count($rows);

        $this->info('Legacy brand mapping by slug finished.');
        $this->line("Total: {$total}");
        $this->line("Matched: {$matched}");
        $this->line("Unmatched: {$unmatched}");
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));

        if ($unmatched > 0) {
            $this->warn('Unmatched slugs (first 50):');
            $shown = 0;

            foreach ($rows as $row) {
                if ($row['status'] !== 'unmatched') {
                    continue;
                }

                $this->line(sprintf(
                    '- manufacturer_id=%d slug=%s',
                    $row['legacy_manufacturer_id'],
                    (string) $row['legacy_slug']
                ));

                $shown++;
                if ($shown >= 50) {
                    break;
                }
            }
        }

        return self::SUCCESS;
    }

    /**
     * @return array<int, string> [legacy_manufacturer_id => slug]
     */
    private function extractManufacturerSlugsFromDump(string $dumpPath): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $inInsert = false;
        $statement = '';
        $result = [];

        while (($line = fgets($handle)) !== false) {
            if (! $inInsert) {
                if (str_starts_with($line, 'INSERT INTO `oc_url_alias`')) {
                    $inInsert = true;
                    $statement = $line;
                }
                continue;
            }

            $statement .= $line;
            if (! str_contains($line, ';')) {
                continue;
            }

            $pairs = $this->extractManufacturerPairsFromInsert($statement);
            foreach ($pairs as $manufacturerId => $slug) {
                $result[$manufacturerId] = $slug;
            }

            $inInsert = false;
            $statement = '';
        }

        fclose($handle);

        return $result;
    }

    /**
     * @return array<int, string>
     */
    private function extractManufacturerPairsFromInsert(string $insertSql): array
    {
        $valuesPos = stripos($insertSql, 'VALUES');
        if ($valuesPos === false) {
            return [];
        }

        $valuesSql = substr($insertSql, $valuesPos + 6);
        $tuples = $this->splitSqlTuples($valuesSql);

        $pairs = [];

        foreach ($tuples as $tuple) {
            $fields = $this->splitTupleFields($tuple);
            if (count($fields) < 3) {
                continue;
            }

            $query = $this->unquoteSqlString(trim($fields[1]));
            $slug = $this->unquoteSqlString(trim($fields[2]));

            if ($query === null || $slug === null || $slug === '') {
                continue;
            }

            if (preg_match('/^manufacturer_id=(\\d+)$/', $query, $matches) !== 1) {
                continue;
            }

            $legacyManufacturerId = (int) $matches[1];
            $pairs[$legacyManufacturerId] = $slug;
        }

        return $pairs;
    }

    /**
     * @return list<string>
     */
    private function splitSqlTuples(string $valuesSql): array
    {
        $result = [];
        $buffer = '';
        $depth = 0;
        $inQuote = false;
        $escaped = false;

        $len = strlen($valuesSql);
        for ($i = 0; $i < $len; $i++) {
            $ch = $valuesSql[$i];

            if ($inQuote) {
                $buffer .= $ch;

                if ($escaped) {
                    $escaped = false;
                    continue;
                }

                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }

                if ($ch === "'") {
                    $inQuote = false;
                }

                continue;
            }

            if ($ch === "'") {
                $inQuote = true;
                $buffer .= $ch;
                continue;
            }

            if ($ch === '(') {
                $depth++;
                if ($depth === 1) {
                    $buffer = '';
                    continue;
                }
            }

            if ($ch === ')') {
                if ($depth === 1) {
                    $result[] = $buffer;
                    $buffer = '';
                    $depth = 0;
                    continue;
                }
                $depth = max(0, $depth - 1);
            }

            if ($depth >= 1) {
                $buffer .= $ch;
            }
        }

        return $result;
    }

    /**
     * @return list<string>
     */
    private function splitTupleFields(string $tuple): array
    {
        $fields = [];
        $buffer = '';
        $inQuote = false;
        $escaped = false;
        $len = strlen($tuple);

        for ($i = 0; $i < $len; $i++) {
            $ch = $tuple[$i];

            if ($inQuote) {
                $buffer .= $ch;

                if ($escaped) {
                    $escaped = false;
                    continue;
                }

                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }

                if ($ch === "'") {
                    $inQuote = false;
                }

                continue;
            }

            if ($ch === "'") {
                $inQuote = true;
                $buffer .= $ch;
                continue;
            }

            if ($ch === ',') {
                $fields[] = $buffer;
                $buffer = '';
                continue;
            }

            $buffer .= $ch;
        }

        $fields[] = $buffer;

        return $fields;
    }

    private function unquoteSqlString(string $value): ?string
    {
        if (strcasecmp($value, 'NULL') === 0) {
            return null;
        }

        if (! str_starts_with($value, "'") || ! str_ends_with($value, "'")) {
            return $value;
        }

        $inner = substr($value, 1, -1);
        $inner = str_replace("\\'", "'", $inner);
        $inner = str_replace('\\\\', '\\', $inner);

        return $inner;
    }
}
