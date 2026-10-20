<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Modules\ImportExport\Support\ElParfume\ElParfumeDumpReader;
use Modules\ImportExport\Support\ElParfume\ElParfumeHtmlContent;
use Modules\ImportExport\Support\ElParfume\ElParfumeRedirectMap;
use Modules\Pages\Models\CmsPost;

class ElParfumeImportPostsCommand extends Command
{
    protected $signature = 'elparfume:import-posts
        {--dump=storage/app/elparfume/el_parfume_b.sql : Path to el-parfume SQL dump}
        {--map=storage/app/elparfume/redirect_map.csv : Redirect map CSV}
        {--images-from= : Optional local directory containing the old site image/ folder}
        {--dry-run : Do not write into DB}';

    protected $description = 'Import el-parfume.by blog articles into cms_posts';

    public function handle(): int
    {
        $dumpPath = $this->resolvePath((string) $this->option('dump'));
        $mapPath = $this->resolvePath((string) $this->option('map'));
        $imagesFrom = trim((string) $this->option('images-from'));
        $dryRun = (bool) $this->option('dry-run');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");

            return self::FAILURE;
        }
        if (! is_file($mapPath)) {
            $this->error("Redirect map not found: {$mapPath}");

            return self::FAILURE;
        }
        if (! Schema::hasTable('cms_posts')) {
            $this->error('cms_posts table is required');

            return self::FAILURE;
        }

        $reader = new ElParfumeDumpReader($dumpPath);
        $redirectMap = ElParfumeRedirectMap::fromCsvPath($mapPath);

        $articles = $this->indexById($reader->rows('oc_oct_blog_article'), 'oct_blog_article_id');
        $descriptions = $this->descriptionsByEntityId(
            $reader->rows('oc_oct_blog_article_description'),
            'oct_blog_article_id',
        );
        $slugByArticleId = $this->blogSlugsByArticleId($reader->rows('oc_url_alias'));

        $imported = 0;
        $skippedExists = 0;
        $inactive = 0;
        /** @var array<string, true> $remoteImages */
        $remoteImages = [];
        $slugCollisions = [];

        foreach ($articles as $articleId => $article) {
            $description = $descriptions[$articleId] ?? null;
            if ($description === null) {
                continue;
            }

            $title = ElParfumeHtmlContent::decode(trim((string) ($description['name'] ?? '')));
            $rawContent = ElParfumeHtmlContent::decode(trim((string) ($description['description'] ?? '')));
            $content = ElParfumeHtmlContent::normalizeNewlines($rawContent);
            $content = ElParfumeHtmlContent::rewriteLinks($content, $redirectMap);
            $content = $this->localizeInlineImages($content, $imagesFrom, $dryRun);
            ElParfumeHtmlContent::collectRemoteImageUrls($content, $remoteImages);

            if ($title === '' && $content === '') {
                continue;
            }
            if ($title === '') {
                $title = 'Статья';
            }

            $baseSlug = trim((string) ($slugByArticleId[$articleId] ?? ''));
            if ($baseSlug === '') {
                $baseSlug = 'article-'.$articleId;
            }

            $slug = $baseSlug;
            $oldPath = ElParfumeHtmlContent::normalizeOldPath('/'.$baseSlug);
            $oldPathForOverride = $oldPath === '/' ? '/' : $oldPath.'/';

            if ($this->slugTaken($slug)) {
                $slug = $baseSlug.'-elp';
                $slugCollisions[] = [
                    'old_path' => $oldPathForOverride,
                    'target' => '/'.$slug,
                    'base' => $baseSlug,
                ];
                $this->line("Slug collision: {$baseSlug} -> {$slug}");
            }

            if (DB::table('cms_posts')->where('slug', $slug)->exists()) {
                $this->line("exists: {$slug}");
                $skippedExists++;
                continue;
            }

            $isActive = (int) ($article['status'] ?? 0) === 1;
            if (! $isActive) {
                $inactive++;
            }

            $createdAt = $this->normalizeDateTime((string) ($article['date_added'] ?? ''));
            $updatedAt = $this->normalizeDateTime((string) ($article['date_modified'] ?? '')) ?? $createdAt;

            $coverPath = trim((string) ($article['image'] ?? ''));
            $coverImage = $this->resolveCoverImage($coverPath, $imagesFrom, $remoteImages);

            $excerpt = ElParfumeHtmlContent::buildExcerptFromContent($content);
            $seoTitle = ElParfumeHtmlContent::decode(trim((string) ($description['meta_title'] ?? '')));
            $seoDescription = ElParfumeHtmlContent::decode(trim((string) ($description['meta_description'] ?? '')));

            if ($dryRun) {
                $this->line("[dry-run] import article {$articleId} slug={$slug} active=".($isActive ? '1' : '0'));
                $imported++;
                continue;
            }

            DB::table('cms_posts')->insert([
                'is_active' => $isActive,
                'title' => $title,
                'slug' => $slug,
                'type' => CmsPost::TYPE_ARTICLE,
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

        if ($slugCollisions !== [] && ! $dryRun) {
            $this->appendManualOverrides($slugCollisions);
        } elseif ($slugCollisions !== [] && $dryRun) {
            foreach ($slugCollisions as $collision) {
                $this->line("[dry-run] manual override: {$collision['old_path']} -> {$collision['target']}");
            }
        }

        $this->info('El-parfume posts import finished.');
        $this->line('Articles in dump: '.count($articles));
        $this->line("Imported: {$imported}");
        $this->line("Skipped (exists): {$skippedExists}");
        $this->line("Inactive rows: {$inactive}");
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));

        if ($remoteImages !== []) {
            $this->line('Remote image URLs (copy locally later):');
            foreach (array_keys($remoteImages) as $url) {
                $this->line('  '.$url);
            }
        }

        return self::SUCCESS;
    }

    /**
     * @param  list<array<string, ?string>>  $rows
     * @return array<string, array<string, ?string>>
     */
    private function indexById(array $rows, string $idColumn): array
    {
        $indexed = [];
        foreach ($rows as $row) {
            $id = trim((string) ($row[$idColumn] ?? ''));
            if ($id !== '') {
                $indexed[$id] = $row;
            }
        }

        return $indexed;
    }

    /**
     * @param  list<array<string, ?string>>  $rows
     * @return array<string, array<string, ?string>>
     */
    private function descriptionsByEntityId(array $rows, string $idColumn): array
    {
        $indexed = [];
        foreach ($rows as $row) {
            if ((string) ($row['language_id'] ?? '') !== '1') {
                continue;
            }
            $id = trim((string) ($row[$idColumn] ?? ''));
            if ($id !== '') {
                $indexed[$id] = $row;
            }
        }

        return $indexed;
    }

    /**
     * @param  list<array<string, ?string>>  $aliases
     * @return array<string, string>
     */
    private function blogSlugsByArticleId(array $aliases): array
    {
        $result = [];
        foreach ($aliases as $alias) {
            $query = (string) ($alias['query'] ?? '');
            if (preg_match('/^oct_blog_article_id=(\d+)$/', $query, $matches) !== 1) {
                continue;
            }
            $result[$matches[1]] = trim((string) ($alias['keyword'] ?? ''));
        }

        return $result;
    }

    private function slugTaken(string $slug): bool
    {
        if ($slug === '') {
            return true;
        }

        if (Schema::hasTable('products') && DB::table('products')->where('slug', $slug)->exists()) {
            return true;
        }
        if (Schema::hasTable('cms_pages') && DB::table('cms_pages')->where('slug', $slug)->exists()) {
            return true;
        }
        if (DB::table('cms_posts')->where('slug', $slug)->exists()) {
            return true;
        }

        return false;
    }

    /**
     * @param  array<string, true>  $remoteImages
     */
    private function resolveCoverImage(string $relativePath, string $imagesFrom, array &$remoteImages): string
    {
        $relativePath = ltrim(str_replace('\\', '/', trim($relativePath)), '/');
        if ($relativePath === '') {
            return '';
        }

        if ($imagesFrom !== '') {
            $local = rtrim($imagesFrom, '/\\').'/image/'.$relativePath;
            if (is_file($local)) {
                $dest = 'cms/posts/import/elparfume/'.$relativePath;
                Storage::disk('public')->put($dest, (string) file_get_contents($local));

                return Storage::url($dest);
            }
        }

        $url = 'https://el-parfume.by/image/'.$relativePath;
        $remoteImages[$url] = true;

        return $url;
    }

    private function localizeInlineImages(string $html, string $imagesFrom, bool $dryRun): string
    {
        if ($html === '' || $imagesFrom === '') {
            return $html;
        }

        return (string) preg_replace_callback(
            '#(\bsrc\s*=\s*["\'])https?://(?:www\.)?el-parfume\.by/image/([^"\']+)#i',
            function (array $matches) use ($imagesFrom, $dryRun): string {
                $relativePath = ltrim(rawurldecode(html_entity_decode($matches[2], ENT_QUOTES | ENT_HTML5, 'UTF-8')), '/');
                $local = rtrim($imagesFrom, '/\\').'/image/'.$relativePath;
                if (str_contains($relativePath, '..') || ! is_file($local)) {
                    return $matches[0];
                }
                $dest = 'cms/posts/import/elparfume/'.$relativePath;
                if (! $dryRun) {
                    Storage::disk('public')->put($dest, (string) file_get_contents($local));
                }

                return $matches[1].Storage::url($dest);
            },
            $html,
        );
    }

    /**
     * @param  list<array{old_path:string,target:string,base:string}>  $collisions
     */
    private function appendManualOverrides(array $collisions): void
    {
        $path = storage_path('app/elparfume/manual_overrides.csv');
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $needsHeader = ! is_file($path) || filesize($path) === 0;
        $handle = fopen($path, 'ab');
        if (! $handle) {
            $this->warn("Could not append manual overrides: {$path}");

            return;
        }

        if ($needsHeader) {
            fputcsv($handle, ['old_path', 'target']);
        }

        $existing = [];
        if (! $needsHeader) {
            foreach (ElParfumeRedirectMap::readCsvRows($path) as $row) {
                $existing[trim((string) ($row['old_path'] ?? ''))] = true;
            }
        }

        foreach ($collisions as $collision) {
            $oldPath = $collision['old_path'];
            if (isset($existing[$oldPath])) {
                continue;
            }
            fputcsv($handle, [$oldPath, $collision['target']]);
            $existing[$oldPath] = true;
            $this->line("manual override: {$oldPath} -> {$collision['target']}");
        }

        fclose($handle);
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
