<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\ImportExport\Support\ElParfume\ElParfumeDumpReader;
use Modules\ImportExport\Support\ElParfume\ElParfumeHtmlContent;
use Modules\ImportExport\Support\ElParfume\ElParfumeRedirectMap;
use Modules\Reviews\Models\Review;

class ElParfumeImportReviewsCommand extends Command
{
    protected $signature = 'elparfume:import-reviews
        {--dump=storage/app/elparfume/el_parfume_b.sql : Path to el-parfume SQL dump}
        {--map=storage/app/elparfume/redirect_map.csv : Redirect map CSV}
        {--dry-run : Do not write into DB}';

    protected $description = 'Import el-parfume.by product and store reviews';

    /** @var list<string> */
    private const IGNORED_PRO_CON = ['нет', 'пока что не нашла', 'пока не нашла', '-', 'нету'];

    public function handle(): int
    {
        $dumpPath = $this->resolvePath((string) $this->option('dump'));
        $mapPath = $this->resolvePath((string) $this->option('map'));
        $dryRun = (bool) $this->option('dry-run');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");

            return self::FAILURE;
        }
        if (! is_file($mapPath)) {
            $this->error("Redirect map not found: {$mapPath}");

            return self::FAILURE;
        }
        if (! Schema::hasTable('reviews')) {
            $this->error('reviews table is required');

            return self::FAILURE;
        }

        $reader = new ElParfumeDumpReader($dumpPath);
        $redirectMap = ElParfumeRedirectMap::fromCsvPath($mapPath);

        $productNames = $this->productNamesById($reader->rows('oc_product_description'));
        $extensionByReviewId = $this->extensionByReviewId(
            $reader->rows('oc_review'),
            $reader->rows('oc_oct_product_reviews'),
        );

        $total = 0;
        $boundProduct = 0;
        $storeUnmatchedProduct = 0;
        $storeOriginal = 0;
        $published = 0;
        $pending = 0;
        $skippedExisting = 0;

        foreach ($reader->rows('oc_review') as $row) {
            $legacyProductId = (int) ($row['product_id'] ?? 0);
            if ($legacyProductId <= 0) {
                continue;
            }

            $total++;
            $reviewId = trim((string) ($row['review_id'] ?? ''));
            $extension = $extensionByReviewId[$reviewId] ?? null;

            $body = $this->buildProductReviewBody($row, $extension);
            $reply = $this->resolveReplyText(
                (string) ($extension['admin_answer'] ?? ''),
                (string) ($row['date_modified'] ?? ''),
                (string) ($row['date_added'] ?? ''),
            );

            $productId = $redirectMap->resolveBoundProductId((string) $legacyProductId);
            if ($productId !== null && Schema::hasTable('products') && ! DB::table('products')->where('id', $productId)->exists()) {
                $productId = null;
            }

            $type = Review::TYPE_PRODUCT;
            if ($productId === null) {
                $type = Review::TYPE_STORE;
                $productName = $productNames[(string) $legacyProductId] ?? 'товар #'.$legacyProductId;
                $body = 'Отзыв о товаре: '.$productName."\n\n".$body;
                $storeUnmatchedProduct++;
            } else {
                $boundProduct++;
            }

            $stars = max(1, min(5, (int) ($row['rating'] ?? 5)));
            [$status, $publishedAt] = $this->resolveStatus(
                (int) ($row['status'] ?? 0),
                $stars,
                (string) ($row['date_added'] ?? ''),
            );

            $name = trim(ElParfumeHtmlContent::decode((string) ($row['author'] ?? '')));
            if ($name === '') {
                $name = 'Покупатель';
            }

            $createdAt = $this->normalizeDateTime((string) ($row['date_added'] ?? '')) ?? now()->toDateTimeString();
            $updatedAt = $this->normalizeDateTime((string) ($row['date_modified'] ?? '')) ?? $createdAt;

            if ($this->reviewExists($type, $productId, $name, $body, $createdAt, $publishedAt)) {
                $skippedExisting++;
                continue;
            }

            if ($status === Review::STATUS_PUBLISHED) {
                $published++;
            } else {
                $pending++;
            }

            if ($dryRun) {
                continue;
            }

            DB::table('reviews')->insert([
                'type' => $type,
                'product_id' => $productId,
                'name' => $name,
                'body' => $body !== '' ? $body : 'Без текста',
                'stars' => $stars,
                'status' => $status,
                'published_at' => $publishedAt,
                'reply_text' => $reply['text'],
                'replied_at' => $reply['replied_at'],
                'created_at' => $createdAt,
                'updated_at' => $updatedAt,
            ]);
        }

        foreach ($reader->rows('oc_oct_sreview_reviews') as $row) {
            $total++;
            $storeOriginal++;

            $body = ElParfumeHtmlContent::normalizeNewlines(
                ElParfumeHtmlContent::decode(trim((string) ($row['text'] ?? ''))),
            );
            $reply = $this->resolveReplyText(
                (string) ($row['admin_text'] ?? ''),
                (string) ($row['date_modified'] ?? ''),
                (string) ($row['date_added'] ?? ''),
            );

            $stars = max(1, min(5, (int) ($row['avg_rating'] ?? 5)));
            [$status, $publishedAt] = $this->resolveStatus(
                (int) ($row['status'] ?? 0),
                $stars,
                (string) ($row['date_added'] ?? ''),
            );

            $name = trim(ElParfumeHtmlContent::decode((string) ($row['author'] ?? '')));
            if ($name === '') {
                $name = 'Покупатель';
            }

            $createdAt = $this->normalizeDateTime((string) ($row['date_added'] ?? '')) ?? now()->toDateTimeString();
            $updatedAt = $this->normalizeDateTime((string) ($row['date_modified'] ?? '')) ?? $createdAt;

            if ($this->reviewExists(Review::TYPE_STORE, null, $name, $body, $createdAt, $publishedAt)) {
                $skippedExisting++;
                continue;
            }

            if ($status === Review::STATUS_PUBLISHED) {
                $published++;
            } else {
                $pending++;
            }

            if ($dryRun) {
                continue;
            }

            DB::table('reviews')->insert([
                'type' => Review::TYPE_STORE,
                'product_id' => null,
                'name' => $name,
                'body' => $body !== '' ? $body : 'Без текста',
                'stars' => $stars,
                'status' => $status,
                'published_at' => $publishedAt,
                'reply_text' => $reply['text'],
                'replied_at' => $reply['replied_at'],
                'created_at' => $createdAt,
                'updated_at' => $updatedAt,
            ]);
        }

        $this->info('El-parfume reviews import finished.');
        $this->line("Total: {$total}");
        $this->line("Bound to product: {$boundProduct}");
        $this->line("Store (unmatched product): {$storeUnmatchedProduct}");
        $this->line("Store (original): {$storeOriginal}");
        $this->line("Published: {$published}");
        $this->line("Pending: {$pending}");
        $this->line("Skipped existing: {$skippedExisting}");
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));

        return self::SUCCESS;
    }

    /**
     * @param  list<array<string, ?string>>  $descriptions
     * @return array<string, string>
     */
    private function productNamesById(array $descriptions): array
    {
        $names = [];
        foreach ($descriptions as $row) {
            if ((string) ($row['language_id'] ?? '') !== '1') {
                continue;
            }
            $id = trim((string) ($row['product_id'] ?? ''));
            if ($id === '') {
                continue;
            }
            $names[$id] = ElParfumeHtmlContent::decode(trim((string) ($row['name'] ?? '')));
        }

        return $names;
    }

    /**
     * @param  list<array<string, ?string>>  $reviews
     * @param  list<array<string, ?string>>  $extensions
     * @return array<string, array<string, ?string>>
     */
    private function extensionByReviewId(array $reviews, array $extensions): array
    {
        $validIds = [];
        foreach ($reviews as $review) {
            $id = trim((string) ($review['review_id'] ?? ''));
            if ($id !== '') {
                $validIds[$id] = true;
            }
        }

        $indexed = [];
        foreach ($extensions as $extension) {
            $id = trim((string) ($extension['review_id'] ?? ''));
            if ($id === '' || ! isset($validIds[$id])) {
                continue;
            }
            $indexed[$id] = $extension;
        }

        return $indexed;
    }

    /**
     * @param  array<string, ?string>  $row
     * @param  array<string, ?string>|null  $extension
     */
    private function buildProductReviewBody(array $row, ?array $extension): string
    {
        $body = ElParfumeHtmlContent::normalizeNewlines(
            ElParfumeHtmlContent::decode(trim((string) ($row['text'] ?? ''))),
        );

        if ($extension !== null) {
            $positive = ElParfumeHtmlContent::decode(trim((string) ($extension['positive_text'] ?? '')));
            $negative = ElParfumeHtmlContent::decode(trim((string) ($extension['negative_text'] ?? '')));

            if ($this->isMeaningfulProsCons($positive)) {
                $body = rtrim($body)."\n\nДостоинства: ".$positive;
            }
            if ($this->isMeaningfulProsCons($negative)) {
                $body = rtrim($body)."\n\nНедостатки: ".$negative;
            }
        }

        return trim($body);
    }

    private function isMeaningfulProsCons(string $text): bool
    {
        $text = trim($text);
        if ($text === '') {
            return false;
        }
        if (preg_match('/^[+\-]+$/u', $text) === 1) {
            return false;
        }

        return ! in_array(mb_strtolower($text, 'UTF-8'), self::IGNORED_PRO_CON, true);
    }

    /**
     * @return array{text:?string,replied_at:?string}
     */
    private function resolveReplyText(string $adminText, string $dateModified, string $dateAdded): array
    {
        $replyText = trim(ElParfumeHtmlContent::decode($adminText));
        if ($replyText === '') {
            return ['text' => null, 'replied_at' => null];
        }

        $repliedAt = $this->normalizeDateTime($dateModified)
            ?? $this->normalizeDateTime($dateAdded)
            ?? now()->toDateTimeString();

        return ['text' => $replyText, 'replied_at' => $repliedAt];
    }

    /**
     * @return array{0:string,1:?string}
     */
    private function resolveStatus(int $legacyStatus, int $stars, string $dateAdded): array
    {
        $createdAt = $this->normalizeDateTime($dateAdded);
        if ($legacyStatus === 1 && $stars >= 4) {
            return [Review::STATUS_PUBLISHED, $createdAt];
        }

        return [Review::STATUS_PENDING, null];
    }

    private function reviewExists(
        string $type,
        ?int $productId,
        string $name,
        string $body,
        string $createdAt,
        ?string $publishedAt,
    ): bool {
        $query = DB::table('reviews')
            ->where('type', $type)
            ->where('name', $name)
            ->where('body', $body)
            ->where('created_at', $createdAt);

        if ($productId === null) {
            $query->whereNull('product_id');
        } else {
            $query->where('product_id', $productId);
        }

        if ($publishedAt !== null) {
            $query->where('published_at', $publishedAt);
        } else {
            $query->whereNull('published_at');
        }

        return $query->exists();
    }

    private function normalizeDateTime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '' || $value === '0000-00-00 00:00:00') {
            return null;
        }

        return $value;
    }

    private function resolvePath(string $path): string
    {
        $path = trim($path);
        if ($path === '' || $path[0] === DIRECTORY_SEPARATOR) {
            return $path;
        }

        return base_path($path);
    }
}
