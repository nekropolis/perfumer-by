<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Reviews\Models\Review;

class ImportLegacyReviewsCommand extends Command
{
    protected $signature = 'legacy:import-reviews
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--dry-run : Do not write into DB}
        {--truncate-map : Truncate legacy_map_reviews before import}';

    protected $description = 'Import legacy oc_review records; unmatched product reviews are staged in legacy_unmatched_products';

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $dryRun = (bool) $this->option('dry-run');
        $truncateMap = (bool) $this->option('truncate-map');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");
            return self::FAILURE;
        }

        $reviews = $this->extractLegacyReviewsFromDump($dumpPath);
        if ($reviews === []) {
            $this->warn('No oc_review rows found in dump.');
            return self::SUCCESS;
        }

        $matchedProductMap = DB::table('legacy_map_products')
            ->where('status', 'matched')
            ->whereNotNull('product_id')
            ->pluck('product_id', 'legacy_product_id')
            ->all();

        $linkedUnmatchedMap = DB::table('legacy_unmatched_products')
            ->where('status', 'linked')
            ->whereNotNull('linked_product_id')
            ->pluck('linked_product_id', 'legacy_product_id')
            ->all();

        $existingMap = DB::table('legacy_map_reviews')
            ->pluck('status', 'legacy_review_id')
            ->all();

        $processed = 0;
        $importedProduct = 0;
        $pendingLink = 0;
        $skippedExisting = 0;
        $failed = 0;

        if (! $dryRun && $truncateMap) {
            DB::table('legacy_map_reviews')->truncate();
            $existingMap = [];
        }

        foreach ($reviews as $legacy) {
            $processed++;
            $legacyReviewId = (int) $legacy['legacy_review_id'];

            if (isset($existingMap[$legacyReviewId])) {
                $skippedExisting++;
                continue;
            }

            $legacyProductId = (int) $legacy['legacy_product_id'];
            $targetProductId = null;

            // В legacy product_id=0 означает отзыв о магазине (не о товаре).
            if ($legacyProductId === 0) {
                if ($dryRun) {
                    $importedProduct++;
                    continue;
                }

                try {
                    $reviewId = $this->findExistingReviewId($legacy, null, Review::TYPE_STORE)
                        ?? $this->createStoreReview($legacy);
                    DB::table('legacy_map_reviews')->insert([
                        'legacy_review_id' => $legacyReviewId,
                        'legacy_product_id' => $legacyProductId,
                        'review_id' => $reviewId,
                        'status' => 'imported_store',
                        'type' => Review::TYPE_STORE,
                        'note' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $importedProduct++;
                } catch (\Throwable $e) {
                    DB::table('legacy_map_reviews')->updateOrInsert(
                        ['legacy_review_id' => $legacyReviewId],
                        [
                            'legacy_product_id' => $legacyProductId,
                            'review_id' => null,
                            'status' => 'failed',
                            'type' => null,
                            'note' => mb_substr($e->getMessage(), 0, 1800),
                            'updated_at' => now(),
                            'created_at' => now(),
                        ]
                    );
                    $failed++;
                }
                continue;
            }

            if (isset($matchedProductMap[$legacyProductId])) {
                $targetProductId = (int) $matchedProductMap[$legacyProductId];
            } elseif (isset($linkedUnmatchedMap[$legacyProductId])) {
                $targetProductId = (int) $linkedUnmatchedMap[$legacyProductId];
            }

            if ($targetProductId !== null && $targetProductId > 0) {
                if ($dryRun) {
                    $importedProduct++;
                    continue;
                }

                try {
                    $reviewId = $this->findExistingReviewId($legacy, $targetProductId, Review::TYPE_PRODUCT)
                        ?? $this->createProductReview($legacy, $targetProductId);
                    DB::table('legacy_map_reviews')->insert([
                        'legacy_review_id' => $legacyReviewId,
                        'legacy_product_id' => $legacyProductId,
                        'review_id' => $reviewId,
                        'status' => isset($matchedProductMap[$legacyProductId]) ? 'imported_product' : 'imported_after_link',
                        'type' => Review::TYPE_PRODUCT,
                        'note' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $importedProduct++;
                } catch (\Throwable $e) {
                    DB::table('legacy_map_reviews')->updateOrInsert(
                        ['legacy_review_id' => $legacyReviewId],
                        [
                            'legacy_product_id' => $legacyProductId,
                            'review_id' => null,
                            'status' => 'failed',
                            'type' => null,
                            'note' => mb_substr($e->getMessage(), 0, 1800),
                            'updated_at' => now(),
                            'created_at' => now(),
                        ]
                    );
                    $failed++;
                }
                continue;
            }

            if ($dryRun) {
                $pendingLink++;
                continue;
            }

            $this->stageReviewInLegacyUnmatchedProduct($legacy);
            DB::table('legacy_map_reviews')->insert([
                'legacy_review_id' => $legacyReviewId,
                'legacy_product_id' => $legacyProductId,
                'review_id' => null,
                'status' => 'pending_link',
                'type' => Review::TYPE_PRODUCT,
                'note' => 'Stored in legacy_unmatched_products.legacy_reviews until product link.',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $pendingLink++;
        }

        $this->info('Legacy reviews import finished.');
        $this->line("Processed: {$processed}");
        $this->line("Imported product reviews: {$importedProduct}");
        $this->line("Pending link (staged): {$pendingLink}");
        $this->line("Skipped existing map: {$skippedExisting}");
        $this->line("Failed: {$failed}");
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));

        return self::SUCCESS;
    }

    /**
     * @return list<array{
     *   legacy_review_id:int, legacy_product_id:int, legacy_customer_id:int, author:string, body:string,
     *   stars:int, legacy_status:int, created_at:?string, updated_at:?string, reply_text:?string, replied_at:?string
     * }>
     */
    private function extractLegacyReviewsFromDump(string $dumpPath): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $result = [];
        $inInsert = false;
        $statement = '';
        $inQuote = false;
        $escaped = false;

        while (($line = fgets($handle)) !== false) {
            if (! $inInsert) {
                if (str_starts_with($line, 'INSERT INTO `oc_review`')) {
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

            $valuesPos = stripos($statement, 'VALUES');
            if ($valuesPos !== false) {
                $valuesSql = substr($statement, $valuesPos + 6);
                $tuples = $this->splitSqlTuples($valuesSql);
                foreach ($tuples as $tuple) {
                    $fields = $this->splitTupleFields($tuple);
                    if (count($fields) < 9) {
                        continue;
                    }

                    $parsedBody = $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[4])) ?? '');
                    $parsedReply = isset($fields[9])
                        ? $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[9])) ?? '')
                        : null;
                    [$reviewBody, $replyFromBody] = $this->splitReviewAndReplyFromBody($parsedBody);
                    $replyText = trim((string) ($parsedReply ?? '')) !== ''
                        ? trim((string) $parsedReply)
                        : $replyFromBody;

                    $result[] = [
                        'legacy_review_id' => (int) trim($fields[0]),
                        'legacy_product_id' => (int) trim($fields[1]),
                        'legacy_customer_id' => (int) trim($fields[2]),
                        'author' => $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[3])) ?? ''),
                        'body' => $reviewBody,
                        'stars' => max(1, min(5, (int) trim($fields[5]))),
                        'legacy_status' => (int) trim($fields[6]),
                        'created_at' => $this->nullableDateTime($this->unquoteSqlString(trim($fields[7]))),
                        'updated_at' => $this->nullableDateTime($this->unquoteSqlString(trim($fields[8]))),
                        'reply_text' => $replyText !== '' ? $replyText : null,
                        'replied_at' => isset($fields[10])
                            ? $this->nullableDateTime($this->unquoteSqlString(trim($fields[10])))
                            : null,
                    ];
                }
            }

            $inInsert = false;
            $statement = '';
        }

        fclose($handle);
        return $result;
    }

    /**
     * @param  array<string,mixed>  $legacy
     */
    private function createProductReview(array $legacy, int $targetProductId): int
    {
        $legacyStatus = (int) ($legacy['legacy_status'] ?? 0);
        $status = $legacyStatus === 1 ? Review::STATUS_PUBLISHED : Review::STATUS_PENDING;
        $createdAt = $legacy['created_at'] ?? null;
        $updatedAt = $legacy['updated_at'] ?? null;
        $publishedAt = $status === Review::STATUS_PUBLISHED ? $createdAt : null;
        $replyText = trim((string) ($legacy['reply_text'] ?? ''));
        $repliedAt = $replyText !== ''
            ? ($legacy['replied_at'] ?? $updatedAt ?? $createdAt ?? now())
            : null;

        return (int) DB::table('reviews')->insertGetId([
            'type' => Review::TYPE_PRODUCT,
            'product_id' => $targetProductId,
            'name' => $legacy['author'] !== '' ? $legacy['author'] : 'Покупатель',
            'body' => $legacy['body'] !== '' ? $legacy['body'] : 'Без текста',
            'stars' => (int) ($legacy['stars'] ?? 5),
            'status' => $status,
            'published_at' => $publishedAt,
            'reply_text' => $replyText !== '' ? $replyText : null,
            'replied_at' => $repliedAt,
            'created_at' => $createdAt ?? now(),
            'updated_at' => $updatedAt ?? $createdAt ?? now(),
        ]);
    }

    /**
     * @param  array<string,mixed>  $legacy
     */
    private function createStoreReview(array $legacy): int
    {
        $legacyStatus = (int) ($legacy['legacy_status'] ?? 0);
        $status = $legacyStatus === 1 ? Review::STATUS_PUBLISHED : Review::STATUS_PENDING;
        $createdAt = $legacy['created_at'] ?? null;
        $updatedAt = $legacy['updated_at'] ?? null;
        $publishedAt = $status === Review::STATUS_PUBLISHED ? $createdAt : null;
        $replyText = trim((string) ($legacy['reply_text'] ?? ''));
        $repliedAt = $replyText !== ''
            ? ($legacy['replied_at'] ?? $updatedAt ?? $createdAt ?? now())
            : null;

        return (int) DB::table('reviews')->insertGetId([
            'type' => Review::TYPE_STORE,
            'product_id' => null,
            'name' => $legacy['author'] !== '' ? $legacy['author'] : 'Покупатель',
            'body' => $legacy['body'] !== '' ? $legacy['body'] : 'Без текста',
            'stars' => (int) ($legacy['stars'] ?? 5),
            'status' => $status,
            'published_at' => $publishedAt,
            'reply_text' => $replyText !== '' ? $replyText : null,
            'replied_at' => $repliedAt,
            'created_at' => $createdAt ?? now(),
            'updated_at' => $updatedAt ?? $createdAt ?? now(),
        ]);
    }

    /**
     * @param  array<string,mixed>  $legacy
     */
    private function stageReviewInLegacyUnmatchedProduct(array $legacy): void
    {
        $legacyProductId = (int) $legacy['legacy_product_id'];

        $legacyRow = DB::table('legacy_unmatched_products')
            ->where('legacy_product_id', $legacyProductId)
            ->first();

        $reviewPayload = [
            'legacy_review_id' => (int) $legacy['legacy_review_id'],
            'legacy_customer_id' => (int) ($legacy['legacy_customer_id'] ?? 0),
            'author' => (string) $legacy['author'],
            'body' => (string) $legacy['body'],
            'stars' => (int) ($legacy['stars'] ?? 5),
            'legacy_status' => (int) ($legacy['legacy_status'] ?? 0),
            'created_at' => $legacy['created_at'] ?? null,
            'updated_at' => $legacy['updated_at'] ?? null,
            'reply_text' => $legacy['reply_text'] ?? null,
            'replied_at' => $legacy['replied_at'] ?? null,
        ];

        if (! $legacyRow) {
            $legacySlug = DB::table('legacy_map_products')
                ->where('legacy_product_id', $legacyProductId)
                ->value('legacy_slug');

            DB::table('legacy_unmatched_products')->insert([
                'legacy_product_id' => $legacyProductId,
                'legacy_slug' => $legacySlug,
                'legacy_name' => null,
                'legacy_description' => null,
                'legacy_meta_title' => null,
                'legacy_meta_description' => null,
                'legacy_meta_keyword' => null,
                'legacy_reviews' => json_encode([$reviewPayload], JSON_UNESCAPED_UNICODE),
                'status' => 'unmatched',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            return;
        }

        $existing = json_decode((string) ($legacyRow->legacy_reviews ?? '[]'), true);
        if (! is_array($existing)) {
            $existing = [];
        }

        $exists = collect($existing)->contains(fn ($row) => (int) ($row['legacy_review_id'] ?? 0) === (int) $reviewPayload['legacy_review_id']);
        if (! $exists) {
            $existing[] = $reviewPayload;
        }

        DB::table('legacy_unmatched_products')
            ->where('legacy_product_id', $legacyProductId)
            ->update([
                'legacy_reviews' => json_encode(array_values($existing), JSON_UNESCAPED_UNICODE),
                'updated_at' => now(),
            ]);
    }

    private function nullableDateTime(?string $value): ?string
    {
        $trim = trim((string) $value);
        if ($trim === '' || $trim === '0000-00-00 00:00:00') {
            return null;
        }
        return $trim;
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
     * В legacy ответ магазина иногда "приклеен" к body после разделителя из подчёркиваний.
     *
     * @return array{0:string,1:?string}
     */
    private function splitReviewAndReplyFromBody(string $body): array
    {
        if (trim($body) === '') {
            return ['', null];
        }

        // В legacy встречаются как реальные переносы, так и буквальные "\r\n"/"\n" в тексте.
        $normalized = str_replace(["\\r\\n", "\\n", "\r\n", "\r"], "\n", $body);
        $parts = preg_split('/\n_{5,}\n/u', $normalized, 2);

        if (! is_array($parts) || count($parts) < 2) {
            return [trim($body), null];
        }

        $reviewText = trim($parts[0] ?? '');
        $replyText = trim($parts[1] ?? '');

        return [$reviewText, $replyText !== '' ? $replyText : null];
    }

    private function findExistingReviewId(array $legacy, ?int $productId, string $type): ?int
    {
        $createdAt = $legacy['created_at'] ?? null;
        $query = DB::table('reviews')
            ->where('type', $type)
            ->where('product_id', $productId)
            ->where('name', $legacy['author'] !== '' ? $legacy['author'] : 'Покупатель')
            ->where('body', $legacy['body'] !== '' ? $legacy['body'] : 'Без текста')
            ->where('stars', (int) ($legacy['stars'] ?? 5));

        if ($createdAt !== null) {
            $query->where('created_at', $createdAt);
        }

        $existingId = $query->orderByDesc('id')->value('id');

        return $existingId ? (int) $existingId : null;
    }
}
