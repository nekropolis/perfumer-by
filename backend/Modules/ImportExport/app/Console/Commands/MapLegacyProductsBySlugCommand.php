<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Support\LegacyDumpOcReviewExtractor;

class MapLegacyProductsBySlugCommand extends Command
{
    protected $signature = 'legacy:map-products-by-slug
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--dry-run : Do not write into DB}
        {--truncate : Truncate legacy_map_products before write}
        {--sync-fields : Sync description/meta fields into matched products}
        {--export-unmatched= : Export full unmatched list to CSV file path}';

    protected $description = 'Map legacy products to current products by slug and optionally sync name/SEO/content fields';

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $dryRun = (bool) $this->option('dry-run');
        $truncate = (bool) $this->option('truncate');
        $syncFields = (bool) $this->option('sync-fields');
        $exportUnmatchedPath = trim((string) ($this->option('export-unmatched') ?? ''));

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");
            return self::FAILURE;
        }

        $legacySlugs = $this->extractProductSlugsFromDump($dumpPath);
        if (empty($legacySlugs)) {
            $this->warn('No product slugs found in oc_url_alias.');
            return self::SUCCESS;
        }

        $legacyDescriptions = $this->extractProductDescriptionsFromDump($dumpPath);

        $productsBySlug = Product::query()
            ->whereNotNull('slug')
            ->get(['id', 'slug'])
            ->keyBy('slug');

        $rows = [];
        $matchedIds = [];
        $unmatchedRows = [];
        $matched = 0;
        $unmatched = 0;

        foreach ($legacySlugs as $legacyProductId => $legacySlug) {
            $product = $productsBySlug->get($legacySlug);
            $isMatched = $product !== null;

            if ($isMatched) {
                $matched++;
                $matchedIds[$legacyProductId] = (int) $product->id;
            } else {
                $unmatched++;
                $description = $legacyDescriptions[$legacyProductId] ?? null;
                $unmatchedRows[] = [
                    'legacy_product_id' => $legacyProductId,
                    'legacy_slug' => $legacySlug,
                    'legacy_name' => $description['name'] ?? null,
                    'legacy_description' => $description['description'] ?? null,
                    'legacy_meta_title' => $description['meta_title'] ?? null,
                    'legacy_meta_description' => $description['meta_description'] ?? null,
                    'legacy_meta_keyword' => $description['meta_keyword'] ?? null,
                    'status' => 'unmatched',
                    'updated_at' => now(),
                    'created_at' => now(),
                ];
            }

            $rows[] = [
                'legacy_product_id' => $legacyProductId,
                'legacy_slug' => $legacySlug,
                'product_id' => $product?->id,
                'status' => $isMatched ? 'matched' : 'unmatched',
                'match_method' => 'slug_exact',
                'note' => $isMatched ? null : 'No current product found with the same slug',
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        $updatedProducts = 0;

        if (! $dryRun) {
            if ($truncate) {
                // TRUNCATE can cause implicit commit on MySQL/MariaDB; execute it outside transaction.
                DB::table('legacy_map_products')->truncate();
            }

            DB::transaction(function () use ($rows): void {
                DB::table('legacy_map_products')->upsert(
                    $rows,
                    ['legacy_product_id'],
                    ['legacy_slug', 'product_id', 'status', 'match_method', 'note', 'updated_at']
                );
            });

            $this->syncLegacyUnmatchedProductsTable($unmatchedRows, $dumpPath);

            if ($syncFields && $matchedIds !== []) {
                $productsById = Product::query()
                    ->with('brand:id,name')
                    ->whereIn('id', array_values($matchedIds))
                    ->get()
                    ->keyBy('id');

                foreach ($matchedIds as $legacyProductId => $productId) {
                    $description = $legacyDescriptions[$legacyProductId] ?? null;
                    if ($description === null) {
                        continue;
                    }

                    /** @var Product|null $product */
                    $product = $productsById->get($productId);
                    $legacyTitle = trim((string) ($description['name'] ?? ''));
                    $brandName = trim((string) ($product?->brand?->name ?? ''));
                    $normalized = $legacyTitle !== ''
                        ? ProductDisplayName::normalizeLegacyProductTitle($legacyTitle, $brandName)
                        : null;

                    $payload = [
                        'description' => $description['description'] !== '' ? $description['description'] : null,
                        'seo_title' => $description['meta_title'] !== '' ? $description['meta_title'] : null,
                        'seo_description' => $description['meta_description'] !== '' ? $description['meta_description'] : null,
                        'seo_keyword' => $description['meta_keyword'] !== '' ? $description['meta_keyword'] : null,
                        'updated_at' => now(),
                    ];

                    if ($normalized !== null) {
                        $payload['name'] = $normalized['short_name'];
                        $payload['h1'] = $normalized['display_name'];
                        if ($payload['seo_title'] === null || $payload['seo_title'] === '') {
                            $payload['seo_title'] = mb_substr($normalized['display_name'], 0, 255);
                        }
                    }

                    Product::query()
                        ->whereKey($productId)
                        ->update($payload);

                    $updatedProducts++;
                }
            }
        } elseif ($syncFields) {
            foreach ($matchedIds as $legacyProductId => $productId) {
                if (isset($legacyDescriptions[$legacyProductId])) {
                    $updatedProducts++;
                }
            }
        }

        $total = count($rows);
        $this->info('Legacy product mapping by slug finished.');
        $this->line("Total: {$total}");
        $this->line("Matched: {$matched}");
        $this->line("Unmatched: {$unmatched}");
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line('Fields sync: '.($syncFields ? 'enabled' : 'disabled'));
        if ($syncFields) {
            $this->line("Products updated from oc_product_description: {$updatedProducts}");
        }

        if ($unmatched > 0) {
            $this->warn('Unmatched slugs (first 50):');
            $shown = 0;
            foreach ($rows as $row) {
                if ($row['status'] !== 'unmatched') {
                    continue;
                }
                $this->line(sprintf('- product_id=%d slug=%s', $row['legacy_product_id'], (string) $row['legacy_slug']));
                $shown++;
                if ($shown >= 50) {
                    break;
                }
            }
        }

        if ($exportUnmatchedPath !== '') {
            $ok = $this->exportUnmatchedToCsv($rows, $exportUnmatchedPath);
            if (! $ok) {
                $this->error("Failed to export unmatched CSV: {$exportUnmatchedPath}");
                return self::FAILURE;
            }
            $this->info("Unmatched CSV exported: {$exportUnmatchedPath}");
        }

        return self::SUCCESS;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function exportUnmatchedToCsv(array $rows, string $path): bool
    {
        $directory = dirname($path);
        if ($directory !== '' && $directory !== '.' && ! is_dir($directory)) {
            if (! @mkdir($directory, 0775, true) && ! is_dir($directory)) {
                return false;
            }
        }

        $handle = @fopen($path, 'wb');
        if (! $handle) {
            return false;
        }

        fputcsv($handle, ['legacy_product_id', 'legacy_slug', 'status', 'note']);

        foreach ($rows as $row) {
            if (($row['status'] ?? null) !== 'unmatched') {
                continue;
            }

            fputcsv($handle, [
                (int) ($row['legacy_product_id'] ?? 0),
                (string) ($row['legacy_slug'] ?? ''),
                (string) ($row['status'] ?? ''),
                (string) ($row['note'] ?? ''),
            ]);
        }

        fclose($handle);

        return true;
    }

    /**
     * @return array<int, string>
     */
    private function extractProductSlugsFromDump(string $dumpPath): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $inInsert = false;
        $statement = '';
        $result = [];
        $inQuote = false;
        $escaped = false;

        while (($line = fgets($handle)) !== false) {
            if (! $inInsert) {
                if (str_starts_with($line, 'INSERT INTO `oc_url_alias`')) {
                    $inInsert = true;
                    $statement = $line;
                    $inQuote = false;
                    $escaped = false;
                }
                continue;
            }

            $statement .= $line;
            if (! $this->lineEndsSqlStatement($line, $inQuote, $escaped)) {
                continue;
            }

            $pairs = $this->extractProductPairsFromAliasInsert($statement);
            foreach ($pairs as $productId => $slug) {
                $result[$productId] = $slug;
            }

            $inInsert = false;
            $statement = '';
        }

        fclose($handle);
        return $result;
    }

    /**
     * @return array<int, array{name: string, description: string, meta_title: string, meta_description: string, meta_keyword: string}>
     */
    private function extractProductDescriptionsFromDump(string $dumpPath): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $inInsert = false;
        $statement = '';
        $result = [];
        $pickedMeta = [];
        $inQuote = false;
        $escaped = false;

        while (($line = fgets($handle)) !== false) {
            if (! $inInsert) {
                if (str_starts_with($line, 'INSERT INTO `oc_product_description`')) {
                    $inInsert = true;
                    $statement = $line;
                    $inQuote = false;
                    $escaped = false;
                }
                continue;
            }

            $statement .= $line;
            if (! $this->lineEndsSqlStatement($line, $inQuote, $escaped)) {
                continue;
            }

            $rows = $this->extractDescriptionRowsFromInsert($statement);
            foreach ($rows as $row) {
                $pid = $row['product_id'];
                $lang = $row['language_id'];
                $score = $this->descriptionPayloadScore($row);

                if (! isset($pickedMeta[$pid])) {
                    $pickedMeta[$pid] = ['language_id' => $lang, 'score' => $score];
                    $result[$pid] = [
                        'name' => $row['name'],
                        'description' => $row['description'],
                        'meta_title' => $row['meta_title'],
                        'meta_description' => $row['meta_description'],
                        'meta_keyword' => $row['meta_keyword'],
                    ];
                    continue;
                }

                $currentLang = (int) $pickedMeta[$pid]['language_id'];
                $currentScore = (int) $pickedMeta[$pid]['score'];

                // Prefer smaller language_id; for the same language, prefer richer payload.
                if ($lang < $currentLang || ($lang === $currentLang && $score >= $currentScore)) {
                    $pickedMeta[$pid] = ['language_id' => $lang, 'score' => $score];
                    $result[$pid] = [
                        'name' => $row['name'],
                        'description' => $row['description'],
                        'meta_title' => $row['meta_title'],
                        'meta_description' => $row['meta_description'],
                        'meta_keyword' => $row['meta_keyword'],
                    ];
                }
            }

            $inInsert = false;
            $statement = '';
        }

        fclose($handle);
        return $result;
    }

    private function lineEndsSqlStatement(string $line, bool &$inQuote, bool &$escaped): bool
    {
        $len = strlen($line);
        for ($i = 0; $i < $len; $i++) {
            $ch = $line[$i];

            if ($inQuote) {
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
                continue;
            }

            if ($ch === ';') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array{name:string,description:string,meta_title:string,meta_description:string,meta_keyword:string}  $row
     */
    private function descriptionPayloadScore(array $row): int
    {
        $score = 0;
        foreach (['name', 'description', 'meta_title', 'meta_description', 'meta_keyword'] as $key) {
            $value = trim((string) ($row[$key] ?? ''));
            if ($value !== '') {
                $score += mb_strlen($value, 'UTF-8');
            }
        }
        return $score;
    }

    /**
     * @return array<int, string>
     */
    private function extractProductPairsFromAliasInsert(string $insertSql): array
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

            if (preg_match('/^product_id=(\d+)$/', $query, $matches) !== 1) {
                continue;
            }

            $pairs[(int) $matches[1]] = $slug;
        }

        return $pairs;
    }

    /**
     * @return list<array{product_id: int, language_id: int, name: string, description: string, meta_title: string, meta_description: string, meta_keyword: string}>
     */
    private function extractDescriptionRowsFromInsert(string $insertSql): array
    {
        $valuesPos = stripos($insertSql, 'VALUES');
        if ($valuesPos === false) {
            return [];
        }

        $valuesSql = substr($insertSql, $valuesPos + 6);
        $tuples = $this->splitSqlTuples($valuesSql);
        $rows = [];

        foreach ($tuples as $tuple) {
            $fields = $this->splitTupleFields($tuple);
            if (count($fields) < 9) {
                continue;
            }

            $rows[] = [
                'product_id' => (int) trim($fields[0]),
                'language_id' => (int) trim($fields[1]),
                'name' => $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[2])) ?? ''),
                'description' => $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[3])) ?? ''),
                'meta_title' => $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[5])) ?? ''),
                'meta_description' => $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[7])) ?? ''),
                'meta_keyword' => $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[8])) ?? ''),
            ];
        }

        return $rows;
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

    private function decodeLegacyHtml(string $value): string
    {
        if ($value === '') {
            return '';
        }

        return html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /**
     * @param  list<array<string, mixed>>  $unmatchedRows
     */
    private function syncLegacyUnmatchedProductsTable(array $unmatchedRows, string $dumpPath): void
    {
        if (! DB::getSchemaBuilder()->hasTable('legacy_unmatched_products')) {
            return;
        }

        if ($unmatchedRows === []) {
            return;
        }

        $legacyIds = array_map(static fn (array $row): int => (int) $row['legacy_product_id'], $unmatchedRows);

        $existingStatuses = DB::table('legacy_unmatched_products')
            ->whereIn('legacy_product_id', $legacyIds)
            ->pluck('status', 'legacy_product_id')
            ->all();

        $rowsToUpsert = [];
        foreach ($unmatchedRows as $row) {
            $legacyId = (int) $row['legacy_product_id'];
            $status = $existingStatuses[$legacyId] ?? null;
            if ($status !== null && $status !== 'unmatched') {
                continue;
            }
            $rowsToUpsert[] = $row;
        }

        if ($rowsToUpsert === []) {
            return;
        }

        $legacyIdsForUpsert = array_map(static fn (array $row): int => (int) $row['legacy_product_id'], $rowsToUpsert);
        $idSet = array_flip($legacyIdsForUpsert);

        $extractor = new LegacyDumpOcReviewExtractor;
        $reviewsByProductId = [];
        foreach ($extractor->extractAll($dumpPath) as $rev) {
            $pid = (int) $rev['legacy_product_id'];
            if ($pid === 0 || ! isset($idSet[$pid])) {
                continue;
            }
            $reviewsByProductId[$pid][] = $extractor->toStagedPayload($rev);
        }

        $existingReviewsByProduct = DB::table('legacy_unmatched_products')
            ->whereIn('legacy_product_id', $legacyIdsForUpsert)
            ->pluck('legacy_reviews', 'legacy_product_id')
            ->all();

        foreach ($rowsToUpsert as $i => $row) {
            $legacyId = (int) $row['legacy_product_id'];
            $merged = $this->mergeStagedReviewPayloads(
                LegacyDumpOcReviewExtractor::decodeStagedReviewsJson($existingReviewsByProduct[$legacyId] ?? '[]'),
                $reviewsByProductId[$legacyId] ?? []
            );
            $rowsToUpsert[$i]['legacy_reviews'] = json_encode(array_values($merged), JSON_UNESCAPED_UNICODE);
        }

        DB::table('legacy_unmatched_products')->upsert(
            $rowsToUpsert,
            ['legacy_product_id'],
            [
                'legacy_slug',
                'legacy_name',
                'legacy_description',
                'legacy_meta_title',
                'legacy_meta_description',
                'legacy_meta_keyword',
                'legacy_reviews',
                'status',
                'updated_at',
            ]
        );
    }

    /**
     * @param  list<array<string, mixed>>  $a
     * @param  list<array<string, mixed>>  $b
     * @return array<int, array<string, mixed>>
     */
    private function mergeStagedReviewPayloads(array $a, array $b): array
    {
        $byReviewId = [];
        foreach (array_merge($a, $b) as $item) {
            $rid = (int) ($item['legacy_review_id'] ?? 0);
            if ($rid <= 0) {
                continue;
            }
            $byReviewId[$rid] = $item;
        }

        return $byReviewId;
    }
}
