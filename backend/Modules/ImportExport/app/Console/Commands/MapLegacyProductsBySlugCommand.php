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

        $existingMatchedByLegacyId = $truncate ? [] : $this->loadExistingMatchedProductIds();
        $linkedLegacyIds = $this->loadLinkedLegacyProductIds();
        $redirectFromSlugs = $this->loadRedirectFromSlugs();

        $productsBySlug = Product::query()
            ->whereNotNull('slug')
            ->get(['id', 'slug'])
            ->keyBy('slug');

        $rows = [];
        $matchedIds = [];
        $unmatchedRows = [];
        $matched = 0;
        $unmatched = 0;
        $keptMatched = 0;
        $keptLinked = 0;
        $excludedFromRedirect = 0;

        foreach ($legacySlugs as $legacyProductId => $legacySlug) {
            if (isset($existingMatchedByLegacyId[$legacyProductId])) {
                $keptMatched++;
                continue;
            }

            if (isset($linkedLegacyIds[$legacyProductId])) {
                $keptLinked++;
                $rows[] = $this->mapRow($legacyProductId, $legacySlug, null, false, 'Already linked; skipped rematch');
                continue;
            }

            $product = $productsBySlug->get($legacySlug);
            $isMatched = $product !== null;

            if ($isMatched) {
                $matched++;
                $matchedIds[$legacyProductId] = (int) $product->id;
                $rows[] = $this->mapRow($legacyProductId, $legacySlug, (int) $product->id, true, null);
                continue;
            }

            if ($this->slugIsInRedirectFrom($legacySlug, $redirectFromSlugs)) {
                $excludedFromRedirect++;
                $rows[] = $this->mapRow($legacyProductId, $legacySlug, null, false, 'Slug already in seo_redirects from_path');
                continue;
            }

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
                'skip_reason' => null,
                'updated_at' => now(),
                'created_at' => now(),
            ];
            $rows[] = $this->mapRow($legacyProductId, $legacySlug, null, false, 'No current product found with the same slug');
        }

        $updatedProducts = 0;
        $closedStale = ['deleted' => 0, 'requeued_skipped' => 0];

        if (! $dryRun) {
            if ($truncate) {
                // TRUNCATE can cause implicit commit on MySQL/MariaDB; execute it outside transaction.
                DB::table('legacy_map_products')->truncate();
            }

            if ($rows !== []) {
                DB::transaction(function () use ($rows): void {
                    DB::table('legacy_map_products')->upsert(
                        $rows,
                        ['legacy_product_id'],
                        ['legacy_slug', 'product_id', 'status', 'match_method', 'note', 'updated_at']
                    );
                });
            }

            $closedStale = $this->syncLegacyUnmatchedProductsTable(
                $unmatchedRows,
                $dumpPath,
                array_keys($existingMatchedByLegacyId + $matchedIds),
                $redirectFromSlugs,
            );

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

        $this->info('Legacy product mapping by slug finished.');
        $this->line('Dump products: '.count($legacySlugs));
        $this->line("Matched: {$matched}");
        $this->line("Kept existing matched: {$keptMatched}");
        $this->line("Kept linked: {$keptLinked}");
        $this->line("Excluded (slug in seo_redirects From): {$excludedFromRedirect}");
        $this->line("Unmatched queued: {$unmatched}");
        $this->line('Closed stale unmatched: '.$closedStale['deleted']);
        $this->line('Requeued skipped: '.$closedStale['requeued_skipped']);
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line('Fields sync: '.($syncFields ? 'enabled' : 'disabled'));
        if ($syncFields) {
            $this->line("Products updated from oc_product_description: {$updatedProducts}");
        }

        if ($unmatched > 0) {
            $this->warn('Unmatched slugs (first 50):');
            $shown = 0;
            foreach ($unmatchedRows as $row) {
                $this->line(sprintf('- product_id=%d slug=%s', $row['legacy_product_id'], (string) $row['legacy_slug']));
                $shown++;
                if ($shown >= 50) {
                    break;
                }
            }
        }

        if ($exportUnmatchedPath !== '') {
            $ok = $this->exportUnmatchedToCsv($unmatchedRows, $exportUnmatchedPath);
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
     * @param  list<int>  $matchedLegacyIds
     * @param  array<string, true>  $redirectFromSlugs
     * @return array{deleted: int, requeued_skipped: int}
     */
    private function syncLegacyUnmatchedProductsTable(
        array $unmatchedRows,
        string $dumpPath,
        array $matchedLegacyIds,
        array $redirectFromSlugs,
    ): array {
        $deleted = 0;
        $requeued = 0;

        if (! DB::getSchemaBuilder()->hasTable('legacy_unmatched_products')) {
            return ['deleted' => 0, 'requeued_skipped' => 0];
        }

        $matchedLegacyIds = array_values(array_unique(array_map('intval', $matchedLegacyIds)));
        if ($matchedLegacyIds !== []) {
            $deleted += (int) DB::table('legacy_unmatched_products')
                ->where('status', '!=', 'linked')
                ->whereIn('legacy_product_id', $matchedLegacyIds)
                ->delete();
        }

        $fromSlugs = array_keys($redirectFromSlugs);
        if ($fromSlugs !== []) {
            $deleted += (int) DB::table('legacy_unmatched_products')
                ->where('status', '!=', 'linked')
                ->whereIn('legacy_slug', $fromSlugs)
                ->delete();
        }

        $requeued = (int) DB::table('legacy_unmatched_products')
            ->where('status', 'skipped')
            ->update([
                'status' => 'unmatched',
                'skip_reason' => null,
                'updated_at' => now(),
            ]);

        if ($unmatchedRows === []) {
            return ['deleted' => $deleted, 'requeued_skipped' => $requeued];
        }

        $legacyIds = array_map(static fn (array $row): int => (int) $row['legacy_product_id'], $unmatchedRows);

        $existingStatuses = DB::table('legacy_unmatched_products')
            ->whereIn('legacy_product_id', $legacyIds)
            ->pluck('status', 'legacy_product_id')
            ->all();

        $rowsToUpsert = [];
        foreach ($unmatchedRows as $row) {
            $legacyId = (int) $row['legacy_product_id'];
            $status = $existingStatuses[$legacyId] ?? $existingStatuses[(string) $legacyId] ?? null;
            if ($status === 'linked') {
                continue;
            }
            $rowsToUpsert[] = $row;
        }

        if ($rowsToUpsert === []) {
            return ['deleted' => $deleted, 'requeued_skipped' => $requeued];
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
                LegacyDumpOcReviewExtractor::decodeStagedReviewsJson($existingReviewsByProduct[$legacyId] ?? $existingReviewsByProduct[(string) $legacyId] ?? '[]'),
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
                'skip_reason',
                'updated_at',
            ]
        );

        return ['deleted' => $deleted, 'requeued_skipped' => $requeued];
    }

    /**
     * @return array<int, int>
     */
    private function loadExistingMatchedProductIds(): array
    {
        if (! DB::getSchemaBuilder()->hasTable('legacy_map_products')) {
            return [];
        }

        return DB::table('legacy_map_products')
            ->where('status', 'matched')
            ->whereNotNull('product_id')
            ->pluck('product_id', 'legacy_product_id')
            ->all();
    }

    /**
     * @return array<int, true>
     */
    private function loadLinkedLegacyProductIds(): array
    {
        if (! DB::getSchemaBuilder()->hasTable('legacy_unmatched_products')) {
            return [];
        }

        $set = [];
        foreach (DB::table('legacy_unmatched_products')->where('status', 'linked')->pluck('legacy_product_id') as $id) {
            $set[(int) $id] = true;
        }

        return $set;
    }

    /**
     * @return array<string, true>
     */
    private function loadRedirectFromSlugs(): array
    {
        if (! DB::getSchemaBuilder()->hasTable('seo_redirects')) {
            return [];
        }

        $slugs = [];
        foreach (DB::table('seo_redirects')->pluck('from_path') as $path) {
            $slug = trim((string) $path, '/');
            if ($slug !== '') {
                $slugs[$slug] = true;
            }
        }

        return $slugs;
    }

    /**
     * @param  array<string, true>  $redirectFromSlugs
     */
    private function slugIsInRedirectFrom(string $slug, array $redirectFromSlugs): bool
    {
        $normalized = trim($slug, '/');
        if ($normalized === '') {
            return false;
        }

        return isset($redirectFromSlugs[$normalized]);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapRow(int $legacyProductId, string $legacySlug, ?int $productId, bool $isMatched, ?string $note): array
    {
        return [
            'legacy_product_id' => $legacyProductId,
            'legacy_slug' => $legacySlug,
            'product_id' => $productId,
            'status' => $isMatched ? 'matched' : 'unmatched',
            'match_method' => 'slug_exact',
            'note' => $note,
            'created_at' => now(),
            'updated_at' => now(),
        ];
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
