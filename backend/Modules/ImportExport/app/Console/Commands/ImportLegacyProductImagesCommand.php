<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ImportLegacyProductImagesCommand extends Command
{
    protected $signature = 'legacy:import-product-images
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--dry-run : Do not write into DB}
        {--repair-existing : Normalize already imported legacy paths in product_images}
        {--debug-missing : Print sample missing source paths and candidates}';

    protected $description = 'Import legacy product images (oc_product + oc_product_image) into product_images';

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $dryRun = (bool) $this->option('dry-run');
        $repairExisting = (bool) $this->option('repair-existing');

        if ($repairExisting) {
            $repairStats = $this->repairExistingImagePaths($dryRun, (bool) $this->option('debug-missing'));
            $this->info('Existing product image paths repair finished.');
            $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
            $this->line('Checked existing rows: '.$repairStats['checked']);
            $this->line('Repaired rows: '.$repairStats['repaired']);
            $this->line('Skipped already normalized: '.$repairStats['already_normalized']);
            $this->line('Skipped missing source files: '.$repairStats['missing_source']);
            $this->line('Skipped empty paths: '.$repairStats['empty_path']);

            return self::SUCCESS;
        }

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");
            return self::FAILURE;
        }

        $mainImagesByLegacyProductId = $this->extractMainImagesByProductId($dumpPath);
        $galleryImagesByLegacyProductId = $this->extractGalleryImagesByProductId($dumpPath);

        if ($mainImagesByLegacyProductId === [] && $galleryImagesByLegacyProductId === []) {
            $this->warn('No legacy product images found in dump.');
            return self::SUCCESS;
        }

        $legacyToCurrentProductMap = DB::table('legacy_map_products')
            ->where('status', 'matched')
            ->whereNotNull('product_id')
            ->pluck('product_id', 'legacy_product_id')
            ->all();

        if ($legacyToCurrentProductMap === []) {
            $this->warn('No matched products in legacy_map_products. Run legacy:map-products-by-slug first.');
            return self::SUCCESS;
        }

        $rowsToImport = [];
        $unmatchedLegacyProducts = [];

        $allLegacyProductIds = array_unique(array_merge(
            array_keys($mainImagesByLegacyProductId),
            array_keys($galleryImagesByLegacyProductId),
        ));

        foreach ($allLegacyProductIds as $legacyProductId) {
            $productId = isset($legacyToCurrentProductMap[$legacyProductId])
                ? (int) $legacyToCurrentProductMap[$legacyProductId]
                : 0;

            if ($productId <= 0) {
                $unmatchedLegacyProducts[$legacyProductId] = true;
                continue;
            }

            $seenPaths = [];
            $mainPath = trim((string) ($mainImagesByLegacyProductId[$legacyProductId] ?? ''));
            if ($mainPath !== '') {
                $seenPaths[$mainPath] = true;
                $rowsToImport[] = [
                    'product_id' => $productId,
                    'path' => $mainPath,
                    'alt' => null,
                    'sort_order' => 0,
                    'is_main' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            foreach ($galleryImagesByLegacyProductId[$legacyProductId] ?? [] as $galleryRow) {
                $path = trim((string) ($galleryRow['path'] ?? ''));
                if ($path === '' || isset($seenPaths[$path])) {
                    continue;
                }
                $seenPaths[$path] = true;

                $rowsToImport[] = [
                    'product_id' => $productId,
                    'path' => $path,
                    'alt' => null,
                    'sort_order' => (int) ($galleryRow['sort_order'] ?? 0),
                    'is_main' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
        }

        if ($rowsToImport === []) {
            $this->warn('No images eligible for import after mapping.');
            return self::SUCCESS;
        }

        $resolvedRows = [];
        $missingFiles = 0;
        foreach ($rowsToImport as $row) {
            $resolved = $this->resolveLegacyImagePath($row, $dryRun);
            if ($resolved === null) {
                $missingFiles++;
                continue;
            }
            $resolvedRows[] = $resolved;
        }

        $productIds = array_values(array_unique(array_map(
            static fn (array $row): int => (int) $row['product_id'],
            $resolvedRows
        )));

        $existingPairs = DB::table('product_images')
            ->whereIn('product_id', $productIds)
            ->get(['product_id', 'path'])
            ->map(static fn ($row): string => ((int) $row->product_id).'|'.$row->path)
            ->all();
        $existingSet = array_fill_keys($existingPairs, true);

        $rowsForInsert = [];
        $skippedExisting = 0;

        foreach ($resolvedRows as $row) {
            $key = ((int) $row['product_id']).'|'.$row['path'];
            if (isset($existingSet[$key])) {
                $skippedExisting++;
                continue;
            }

            $rowsForInsert[] = $row;
            $existingSet[$key] = true;
        }

        if (! $dryRun && $rowsForInsert !== []) {
            DB::table('product_images')->insert($rowsForInsert);
        }

        $this->info('Legacy product images import finished.');
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line('Prepared rows: '.count($rowsToImport));
        $this->line('Resolved existing files: '.count($resolvedRows));
        $this->line("Skipped missing source files: {$missingFiles}");
        $this->line('Inserted rows: '.($dryRun ? count($rowsForInsert) : count($rowsForInsert)));
        $this->line("Skipped existing rows: {$skippedExisting}");
        $this->line('Legacy products without mapping: '.count($unmatchedLegacyProducts));

        if ($unmatchedLegacyProducts !== []) {
            $this->warn('Unmatched legacy product IDs (first 50):');
            $shown = 0;
            foreach (array_keys($unmatchedLegacyProducts) as $legacyProductId) {
                $this->line('- legacy_product_id='.$legacyProductId);
                $shown++;
                if ($shown >= 50) {
                    break;
                }
            }
        }

        return self::SUCCESS;
    }

    /**
     * @return array<int, string>
     */
    private function extractMainImagesByProductId(string $dumpPath): array
    {
        $rows = $this->extractRowsFromInsertTable($dumpPath, 'oc_product');
        $result = [];

        foreach ($rows as $row) {
            $legacyProductId = (int) ($row['product_id'] ?? 0);
            $path = trim((string) ($row['image'] ?? ''));
            if ($legacyProductId <= 0 || $path === '') {
                continue;
            }
            $result[$legacyProductId] = $path;
        }

        return $result;
    }

    /**
     * @return array<int, list<array{path:string, sort_order:int}>>
     */
    private function extractGalleryImagesByProductId(string $dumpPath): array
    {
        $rows = $this->extractRowsFromInsertTable($dumpPath, 'oc_product_image');
        $result = [];

        foreach ($rows as $row) {
            $legacyProductId = (int) ($row['product_id'] ?? 0);
            $path = trim((string) ($row['image'] ?? ''));
            if ($legacyProductId <= 0 || $path === '') {
                continue;
            }

            $result[$legacyProductId][] = [
                'path' => $path,
                'sort_order' => (int) ($row['sort_order'] ?? 0),
            ];
        }

        return $result;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function extractRowsFromInsertTable(string $dumpPath, string $tableName): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $result = [];
        $prefix = 'INSERT INTO `'.$tableName.'`';

        while (($line = fgets($handle)) !== false) {
            if (! str_starts_with($line, $prefix)) {
                continue;
            }

            $statement = $line;
            $inQuote = false;
            $escaped = false;

            while (! $this->lineEndsSqlStatement($line, $inQuote, $escaped) && ($line = fgets($handle)) !== false) {
                $statement .= $line;
            }

            $rows = $this->parseInsertStatementRows($statement);
            foreach ($rows as $row) {
                $result[] = $row;
            }
        }

        fclose($handle);

        return $result;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function parseInsertStatementRows(string $insertSql): array
    {
        if (preg_match('/^INSERT INTO `[^`]+`\\s*\\((.+)\\)\\s*VALUES\\s*/is', $insertSql, $colsMatch) !== 1) {
            return [];
        }

        $columnsRaw = (string) $colsMatch[1];
        $columns = array_map(
            static fn (string $col): string => trim(str_replace('`', '', $col)),
            array_filter(array_map('trim', explode(',', $columnsRaw)))
        );

        $valuesPos = stripos($insertSql, 'VALUES');
        if ($valuesPos === false || $columns === []) {
            return [];
        }

        $valuesSql = substr($insertSql, $valuesPos + 6);
        $tuples = $this->splitSqlTuples($valuesSql);
        $result = [];

        foreach ($tuples as $tuple) {
            $fields = $this->splitTupleFields($tuple);
            if (count($fields) !== count($columns)) {
                continue;
            }

            $row = [];
            foreach ($columns as $idx => $column) {
                $raw = trim($fields[$idx] ?? '');
                $row[$column] = $this->unquoteSqlValue($raw);
            }
            $result[] = $row;
        }

        return $result;
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

    private function unquoteSqlValue(string $value): mixed
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

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private function resolveLegacyImagePath(array $row, bool $dryRun): ?array
    {
        $legacyPath = trim((string) ($row['path'] ?? ''));
        $productId = (int) ($row['product_id'] ?? 0);
        if ($legacyPath === '' || $productId <= 0) {
            return null;
        }

        $disk = Storage::disk('public');
        $normalizedLegacyPath = ltrim((string) preg_replace('#^storage/#', '', $legacyPath), '/');
        $sourceRelativePath = $this->resolveExistingSourcePath($disk, $normalizedLegacyPath);
        if (! $this->sourceFileExists($disk, $sourceRelativePath)) {
            return null;
        }

        $destinationDirectory = 'products/'.$productId;
        $basename = pathinfo($legacyPath, PATHINFO_BASENAME);
        if ($basename === '' || $basename === '.' || $basename === '..') {
            $basename = 'image.jpg';
        }

        $destinationRelativePath = $destinationDirectory.'/'.$basename;
        if ($destinationRelativePath !== $sourceRelativePath) {
            $destinationRelativePath = $this->resolveUniqueDestinationPath($disk, $destinationRelativePath, $sourceRelativePath);
            if (! $dryRun && ! $this->sourceFileExists($disk, $destinationRelativePath)) {
                $this->copySourceToPublicPath($disk, $sourceRelativePath, $destinationRelativePath, $destinationDirectory);
            }
        }

        $row['path'] = 'storage/'.$destinationRelativePath;

        return $row;
    }

    private function resolveUniqueDestinationPath(FilesystemAdapter $disk, string $destinationRelativePath, string $sourceRelativePath): string
    {
        if (! $disk->exists($destinationRelativePath) || $destinationRelativePath === $sourceRelativePath) {
            return $destinationRelativePath;
        }

        $extension = pathinfo($destinationRelativePath, PATHINFO_EXTENSION);
        $filename = pathinfo($destinationRelativePath, PATHINFO_FILENAME);
        $dirname = trim((string) pathinfo($destinationRelativePath, PATHINFO_DIRNAME), '/');
        if ($filename === '') {
            $filename = 'image';
        }

        $counter = 2;
        while (true) {
            $candidateBase = $filename.'-'.$counter;
            $candidate = $dirname.'/'.$candidateBase.($extension !== '' ? '.'.$extension : '');
            if (! $disk->exists($candidate) || $candidate === $sourceRelativePath) {
                return $candidate;
            }
            $counter++;
        }
    }

    /**
     * @return array{checked:int,repaired:int,already_normalized:int,missing_source:int,empty_path:int}
     */
    private function repairExistingImagePaths(bool $dryRun, bool $debugMissing): array
    {
        $stats = [
            'checked' => 0,
            'repaired' => 0,
            'already_normalized' => 0,
            'missing_source' => 0,
            'empty_path' => 0,
        ];
        $debugMissingLines = [];

        $disk = Storage::disk('public');

        DB::table('product_images')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use (&$stats, &$debugMissingLines, $disk, $dryRun, $debugMissing): void {
                foreach ($rows as $row) {
                    $stats['checked']++;

                    $currentPath = trim((string) ($row->path ?? ''));
                    $productId = (int) ($row->product_id ?? 0);
                    if ($currentPath === '' || $productId <= 0) {
                        $stats['empty_path']++;
                        continue;
                    }

                    $normalizedCurrent = ltrim((string) preg_replace('#^storage/#', '', $currentPath), '/');
                    if (preg_match('#^products/'.$productId.'/#', $normalizedCurrent) === 1) {
                        $stats['already_normalized']++;
                        continue;
                    }

                    $sourceRelativePath = $this->resolveExistingSourcePath($disk, $normalizedCurrent);
                    if (! $this->sourceFileExists($disk, $sourceRelativePath)) {
                        $stats['missing_source']++;
                        if ($debugMissing && count($debugMissingLines) < 30) {
                            $debugMissingLines[] = sprintf(
                                '#%d image_id=%d product_id=%d path="%s" normalized="%s" resolved="%s" abs="%s"',
                                count($debugMissingLines) + 1,
                                (int) $row->id,
                                $productId,
                                $currentPath,
                                $normalizedCurrent,
                                $sourceRelativePath,
                                storage_path('app/public/'.ltrim($sourceRelativePath, '/'))
                            );
                        }
                        continue;
                    }

                    $basename = pathinfo($normalizedCurrent, PATHINFO_BASENAME);
                    if ($basename === '' || $basename === '.' || $basename === '..') {
                        $basename = 'image.jpg';
                    }

                    $destinationDirectory = 'products/'.$productId;
                    $destinationRelativePath = $destinationDirectory.'/'.$basename;
                    $destinationRelativePath = $this->resolveUniqueDestinationPathForRow(
                        $disk,
                        $destinationRelativePath,
                        $sourceRelativePath,
                        (int) $row->id,
                        $productId
                    );

                    if ($destinationRelativePath !== $sourceRelativePath && ! $dryRun && ! $this->sourceFileExists($disk, $destinationRelativePath)) {
                        $this->copySourceToPublicPath($disk, $sourceRelativePath, $destinationRelativePath, $destinationDirectory);
                    }

                    if (! $dryRun) {
                        DB::table('product_images')
                            ->where('id', (int) $row->id)
                            ->update([
                                'path' => 'storage/'.$destinationRelativePath,
                                'updated_at' => now(),
                            ]);
                    }

                    $stats['repaired']++;
                }
            }, 'id');

        if ($debugMissing && $debugMissingLines !== []) {
            $this->warn('Sample missing source paths:');
            foreach ($debugMissingLines as $line) {
                $this->line($line);
            }
        }

        return $stats;
    }

    private function resolveUniqueDestinationPathForRow(
        FilesystemAdapter $disk,
        string $destinationRelativePath,
        string $sourceRelativePath,
        int $currentImageId,
        int $productId
    ): string {
        if ($destinationRelativePath === $sourceRelativePath) {
            return $destinationRelativePath;
        }

        $dbPath = 'storage/'.$destinationRelativePath;
        $existsInAnotherRow = DB::table('product_images')
            ->where('product_id', $productId)
            ->where('path', $dbPath)
            ->where('id', '!=', $currentImageId)
            ->exists();

        if (! $disk->exists($destinationRelativePath) && ! $existsInAnotherRow) {
            return $destinationRelativePath;
        }

        $extension = pathinfo($destinationRelativePath, PATHINFO_EXTENSION);
        $filename = pathinfo($destinationRelativePath, PATHINFO_FILENAME);
        $dirname = trim((string) pathinfo($destinationRelativePath, PATHINFO_DIRNAME), '/');
        if ($filename === '') {
            $filename = 'image';
        }

        $counter = 2;
        while (true) {
            $candidateBase = $filename.'-'.$counter;
            $candidate = $dirname.'/'.$candidateBase.($extension !== '' ? '.'.$extension : '');
            if ($candidate === $sourceRelativePath) {
                return $candidate;
            }

            $candidateDbPath = 'storage/'.$candidate;
            $existsInDb = DB::table('product_images')
                ->where('product_id', $productId)
                ->where('path', $candidateDbPath)
                ->where('id', '!=', $currentImageId)
                ->exists();
            if (! $disk->exists($candidate) && ! $existsInDb) {
                return $candidate;
            }
            $counter++;
        }
    }

    private function resolveExistingSourcePath(FilesystemAdapter $disk, string $normalizedPath): string
    {
        $normalizedPath = str_replace('\\', '/', $normalizedPath);
        $normalizedPath = preg_replace('#^https?://[^/]+/#i', '', $normalizedPath) ?? $normalizedPath;
        $normalizedPath = preg_replace('#\\?.*$#', '', $normalizedPath) ?? $normalizedPath;
        $normalizedPath = ltrim((string) $normalizedPath, '/');
        if (str_starts_with($normalizedPath, 'image/')) {
            $normalizedPath = ltrim(substr($normalizedPath, 6), '/');
        }
        $candidates = [];

        if ($normalizedPath !== '') {
            // Legacy import source is expected under storage/app/public/products/catalog/...
            // so we prioritize products/<path> first.
            if (! str_starts_with($normalizedPath, 'products/')) {
                $candidates[] = 'products/'.$normalizedPath;
            }
            $candidates[] = $normalizedPath;
            if (str_starts_with($normalizedPath, 'public/')) {
                $withoutPublic = ltrim(substr($normalizedPath, 7), '/');
                if ($withoutPublic !== '') {
                    if (! str_starts_with($withoutPublic, 'products/')) {
                        $candidates[] = 'products/'.$withoutPublic;
                    }
                    $candidates[] = $withoutPublic;
                }
            }

            // Some legacy dumps use `catalog/...`, while files are physically in `category/...` (or vice versa).
            foreach ([$normalizedPath, ...$candidates] as $candidatePath) {
                if (str_contains($candidatePath, 'catalog/')) {
                    $candidates[] = str_replace('catalog/', 'category/', $candidatePath);
                }
                if (str_contains($candidatePath, 'category/')) {
                    $candidates[] = str_replace('category/', 'catalog/', $candidatePath);
                }
            }
        }

        $uniqueCandidates = array_values(array_unique(array_filter($candidates, static fn (string $v): bool => $v !== '')));
        foreach ($uniqueCandidates as $candidate) {
            if ($this->sourceFileExists($disk, $candidate)) {
                return $candidate;
            }
        }

        return $uniqueCandidates[0] ?? $normalizedPath;
    }

    private function sourceFileExists(FilesystemAdapter $disk, string $relativePath): bool
    {
        if ($disk->exists($relativePath)) {
            return true;
        }

        $absolutePath = storage_path('app/public/'.ltrim($relativePath, '/'));

        return is_file($absolutePath);
    }

    private function copySourceToPublicPath(
        FilesystemAdapter $disk,
        string $sourceRelativePath,
        string $destinationRelativePath,
        string $destinationDirectory
    ): void {
        if ($disk->exists($sourceRelativePath)) {
            $disk->makeDirectory($destinationDirectory);
            $disk->copy($sourceRelativePath, $destinationRelativePath);
            return;
        }

        $sourceAbsolutePath = storage_path('app/public/'.ltrim($sourceRelativePath, '/'));
        $destinationAbsolutePath = storage_path('app/public/'.ltrim($destinationRelativePath, '/'));
        $destinationAbsoluteDirectory = dirname($destinationAbsolutePath);
        if (! is_dir($destinationAbsoluteDirectory)) {
            @mkdir($destinationAbsoluteDirectory, 0775, true);
        }
        @copy($sourceAbsolutePath, $destinationAbsolutePath);
    }
}

