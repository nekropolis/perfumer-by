<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Pages\Models\CmsPost;

class ImportLegacyPostsCommand extends Command
{
    protected $signature = 'legacy:import-posts
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--truncate : Truncate cms_posts before import}
        {--report-skips : Print each skipped row with reason (also use -v for the same)}';

    protected $description = 'Import legacy news/articles from SQL dump into cms_posts';

    /** @var list<string> */
    private const NEWS_TABLE_HINTS = [
        'oc_news',
        'oc_news_description',
        'oc_any_news_description',
    ];

    /** @var list<string> */
    private const ARTICLE_TABLE_HINTS = [
        'oc_article',
        'oc_blog',
        'oc_blog_article',
        'oc_simple_blog_article',
        'oc_any_articles_description',
    ];

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $truncate = (bool) $this->option('truncate');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");
            return self::FAILURE;
        }

        if ($truncate) {
            DB::table('cms_posts')->truncate();
        }

        $rows = $this->extractPostsFromDump($dumpPath);
        if ($rows === []) {
            $this->warn('No compatible news/article rows found in dump.');
            return self::SUCCESS;
        }

        $processed = 0;
        $imported = 0;
        $skipped = 0;
        $reportSkips = (bool) $this->option('report-skips')
            || $this->output->isVerbose();

        foreach ($rows as $row) {
            $processed++;

            $type = $this->resolveType($row['table'], $row['raw']);
            if ($type === null) {
                $skipped++;
                if ($reportSkips) {
                    $this->line($this->formatSkipLine($row, 'unknown_type', 'table not mapped to news/article'));
                }
                continue;
            }

            $title = $this->pickFirstString($row['raw'], [
                'title', 'name', 'meta_h1', 'meta_title', 'heading', 'header',
            ]);
            $content = $this->pickFirstString($row['raw'], [
                'description', 'content', 'text', 'body', 'full_text',
            ]);
            $excerpt = $this->pickFirstString($row['raw'], [
                'excerpt', 'short_description', 'intro', 'anons', 'summary',
            ]);

            $content = $this->normalizeLegacyNewlines($content);
            $excerpt = $this->normalizeLegacyNewlines($excerpt);

            if ($excerpt === '' && $content !== '') {
                $excerpt = $this->buildExcerptFromContent($content);
            }

            if ($title === '' && $content === '') {
                $skipped++;
                if ($reportSkips) {
                    $this->line($this->formatSkipLine($row, 'empty_title_and_content', 'no title and no body fields'));
                }
                continue;
            }
            if ($title === '') {
                $title = mb_substr(strip_tags($content), 0, 120, 'UTF-8');
                if ($title === '') {
                    $title = 'Публикация';
                }
            }

            $seoTitle = $this->pickFirstString($row['raw'], ['meta_title', 'seo_title']);
            $seoDescription = $this->normalizeLegacyNewlines(
                $this->pickFirstString($row['raw'], ['meta_description', 'seo_description']),
            );
            $coverImage = $this->pickFirstString($row['raw'], ['image', 'thumb', 'cover_image']);
            $isActive = $this->pickFirstBool($row['raw'], ['status', 'is_active', 'published', 'is_published'], true);
            $createdAt = $this->pickFirstDateTime($row['raw'], ['date_added', 'created_at', 'published_at']);
            $updatedAt = $this->pickFirstDateTime($row['raw'], ['date_modified', 'updated_at']) ?? $createdAt;

            $legacySlugRaw = $this->pickFirstString($row['raw'], [
                'keyword', 'slug', 'seo_url', 'seo_keyword', 'link', 'href',
            ]);
            $slug = $this->resolveImportedPostSlug($type, $legacySlugRaw, $title);

            $exists = DB::table('cms_posts')
                ->where('type', $type)
                ->where('slug', $slug)
                ->exists();

            if ($exists) {
                $skipped++;
                if ($reportSkips) {
                    $this->line($this->formatSkipLine($row, 'duplicate_slug', "{$type}/{$slug} already exists"));
                }
                continue;
            }

            DB::table('cms_posts')->insert([
                'is_active' => $isActive,
                'title' => $title,
                'slug' => $slug,
                'type' => $type,
                'cover_image' => $coverImage !== '' ? $coverImage : null,
                'excerpt' => $excerpt !== '' ? $excerpt : null,
                'content' => $content !== '' ? $content : null,
                'seo_title' => $seoTitle !== '' ? $seoTitle : $title,
                'seo_description' => $seoDescription !== '' ? $seoDescription : null,
                'created_at' => $createdAt ?? now(),
                'updated_at' => $updatedAt ?? $createdAt ?? now(),
            ]);
            $imported++;
        }

        $this->info('Legacy posts import finished.');
        $this->line("Processed: {$processed}");
        $this->line("Imported: {$imported}");
        $this->line("Skipped: {$skipped}");
        if ($skipped > 0 && ! $reportSkips) {
            $this->comment('Hint: run with --report-skips or -v to list each skipped row and reason.');
        }

        return self::SUCCESS;
    }

    /**
     * @param  array{table:string,raw:array<string,mixed>}  $row
     */
    private function formatSkipLine(array $row, string $reason, string $detail): string
    {
        $id = $this->guessLegacyRowId($row['raw']);
        $idPart = $id !== null ? " id={$id}" : '';

        return "[skip] table={$row['table']}{$idPart} reason={$reason} ({$detail})";
    }

    /**
     * @param  array<string,mixed>  $raw
     */
    private function guessLegacyRowId(array $raw): ?string
    {
        foreach ([
            'news_id',
            'article_id',
            'blog_article_id',
            'post_id',
            'simple_blog_article_id',
            'id',
        ] as $key) {
            if (! array_key_exists($key, $raw)) {
                continue;
            }
            $v = $raw[$key];
            if ($v === null || $v === '') {
                continue;
            }
            if (is_numeric($v)) {
                return (string) $v;
            }
            $s = trim((string) $v);
            if ($s !== '') {
                return $s;
            }
        }

        return null;
    }

    /**
     * @return list<array{table:string,raw:array<string,mixed>}>
     */
    private function extractPostsFromDump(string $dumpPath): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $result = [];
        while (($line = fgets($handle)) !== false) {
            if (! preg_match('/^INSERT INTO `([^`]+)`\s*\((.+)\)\s*VALUES\s*/i', $line, $matches)) {
                continue;
            }

            $table = (string) $matches[1];
            if (! $this->isCandidateTable($table)) {
                continue;
            }

            $statement = $line;
            $inQuote = false;
            $escaped = false;
            while (! $this->lineEndsSqlStatement($line, $inQuote, $escaped) && ($line = fgets($handle)) !== false) {
                $statement .= $line;
            }

            preg_match('/^INSERT INTO `[^`]+`\s*\((.+)\)\s*VALUES\s*/is', $statement, $colsMatch);
            $columnsRaw = $colsMatch[1] ?? '';
            $columns = array_map(
                static fn (string $col): string => trim(str_replace('`', '', $col)),
                array_filter(array_map('trim', explode(',', (string) $columnsRaw)))
            );

            $valuesPos = stripos($statement, 'VALUES');
            if ($valuesPos === false || $columns === []) {
                continue;
            }
            $valuesSql = substr($statement, $valuesPos + 6);
            $tuples = $this->splitSqlTuples($valuesSql);

            foreach ($tuples as $tuple) {
                $fields = $this->splitTupleFields($tuple);
                if (count($fields) !== count($columns)) {
                    continue;
                }

                $row = [];
                foreach ($columns as $idx => $column) {
                    $raw = trim($fields[$idx] ?? '');
                    $value = $this->unquoteSqlString($raw);
                    $row[$column] = is_string($value) ? $this->decodeLegacyHtml($value) : $value;
                }

                $result[] = [
                    'table' => $table,
                    'raw' => $row,
                ];
            }
        }

        fclose($handle);

        return $result;
    }

    private function resolveType(string $table, array $row): ?string
    {
        $lt = mb_strtolower($table, 'UTF-8');
        foreach (self::NEWS_TABLE_HINTS as $hint) {
            if (str_contains($lt, $hint)) {
                return CmsPost::TYPE_NEWS;
            }
        }
        foreach (self::ARTICLE_TABLE_HINTS as $hint) {
            if (str_contains($lt, $hint)) {
                return CmsPost::TYPE_ARTICLE;
            }
        }

        $rawType = mb_strtolower((string) ($row['type'] ?? $row['post_type'] ?? ''), 'UTF-8');
        if (in_array($rawType, ['news', 'novost', 'новость', 'novosti'], true)) {
            return CmsPost::TYPE_NEWS;
        }
        if (in_array($rawType, ['article', 'blog', 'статья', 'statya'], true)) {
            return CmsPost::TYPE_ARTICLE;
        }

        return null;
    }

    private function isCandidateTable(string $table): bool
    {
        $lt = mb_strtolower($table, 'UTF-8');

        return str_contains($lt, 'news')
            || str_contains($lt, 'article')
            || str_contains($lt, 'blog');
    }

    private function pickFirstString(array $row, array $keys): string
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $row)) {
                continue;
            }
            $value = trim((string) ($row[$key] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    private function pickFirstBool(array $row, array $keys, bool $default): bool
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $row)) {
                continue;
            }
            $value = (string) $row[$key];
            if ($value === '') {
                continue;
            }
            return (int) $value !== 0;
        }

        return $default;
    }

    private function pickFirstDateTime(array $row, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (! array_key_exists($key, $row)) {
                continue;
            }
            $value = trim((string) ($row[$key] ?? ''));
            if ($value === '' || $value === '0000-00-00 00:00:00') {
                continue;
            }
            return $value;
        }

        return null;
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

    private function unquoteSqlString(string $value): mixed
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
     * Как в импорте отзывов: в дампе часто лежат буквальные "\r\n" / "\n" или смешанные CRLF —
     * приводим к обычным переводам строк, чтобы текст в cms_posts сохранялся читаемо.
     */
    private function normalizeLegacyNewlines(string $value): string
    {
        if ($value === '') {
            return '';
        }

        return str_replace(["\\r\\n", "\\n", "\r\n", "\r"], "\n", $value);
    }

    private function normalizeLegacySlugCandidate(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return '';
        }
        if (preg_match('#^https?://#i', $raw)) {
            $path = parse_url($raw, PHP_URL_PATH);
            $raw = is_string($path) ? $path : '';
        }
        $raw = trim($raw, '/');
        if (str_contains($raw, '/')) {
            $parts = explode('/', $raw);
            $last = end($parts);
            $raw = is_string($last) ? $last : $raw;
        }
        $raw = str_replace('_', '-', $raw);

        return trim($raw);
    }

    private function resolveImportedPostSlug(string $type, string $legacySlugRaw, string $title): string
    {
        $normalized = $this->normalizeLegacySlugCandidate($legacySlugRaw);
        $base = $normalized !== '' ? Str::slug($normalized) : Str::slug($title);
        if ($base === '') {
            $base = 'post';
        }

        $slug = $base;
        $n = 2;
        while (DB::table('cms_posts')->where('type', $type)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$n++;
        }

        return $slug;
    }

    /**
     * Краткая выжимка для excerpt: из HTML-контента — plain text, первый смысловой блок или обрезка по словам.
     */
    private function buildExcerptFromContent(string $htmlContent): string
    {
        $normalized = $this->normalizeLegacyNewlines($htmlContent);
        // Сохраняем абзацы: блочные теги и <br> → перевод строки перед strip_tags.
        $withBreaks = preg_replace(
            '~</\s*(p|div|h[1-6]|li|tr|blockquote)\s*>~iu',
            "\n\n",
            $normalized,
        ) ?? $normalized;
        $withBreaks = preg_replace('~<\s*br\s*/?\s*>~iu', "\n", $withBreaks) ?? $withBreaks;

        $plain = strip_tags($withBreaks);
        $plain = html_entity_decode($plain, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $plain = preg_replace('/[\x{00A0}]+/u', ' ', $plain) ?? $plain;
        $plain = preg_replace('/[ \t]+/u', ' ', $plain) ?? $plain;
        $plain = preg_replace('/\n{3,}/u', "\n\n", $plain) ?? $plain;
        $plain = trim($plain);

        if ($plain === '') {
            return '';
        }

        $paragraphs = preg_split('/\n{2,}/u', $plain) ?: [$plain];
        $first = '';
        foreach ($paragraphs as $block) {
            $block = trim((string) $block);
            if ($block !== '') {
                $first = $block;
                break;
            }
        }
        if ($first === '') {
            $first = $plain;
        }

        $first = preg_replace('/\s+/u', ' ', $first) ?? $first;
        $first = trim((string) $first);

        $maxLen = 400;
        if (mb_strlen($first, 'UTF-8') <= $maxLen) {
            return $first;
        }

        $chunk = mb_substr($first, 0, $maxLen, 'UTF-8');
        $lastSpace = mb_strrpos($chunk, ' ', 0, 'UTF-8');
        if ($lastSpace !== false && $lastSpace > (int) ($maxLen * 0.55)) {
            $chunk = mb_substr($chunk, 0, $lastSpace, 'UTF-8');
        }

        return rtrim($chunk).'…';
    }
}

