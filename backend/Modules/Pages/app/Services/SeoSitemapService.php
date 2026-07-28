<?php

namespace Modules\Pages\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Pages\Models\CmsPage;
use Modules\Pages\Models\CmsPost;

/**
 * Агрегированный список публичных path для Next.js sitemap.
 *
 * @phpstan-type SitemapRow array{path: string, lastModified: string|null, type: string, title: string|null}
 */
class SeoSitemapService
{
    public const CACHE_KEY = 'seo:sitemap-urls:v1';

    public const CACHE_TTL_SECONDS = 3600;

    /**
     * @return list<SitemapRow>
     */
    public function urls(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, fn (): array => $this->build());
    }

    public function count(): int
    {
        return count($this->urls());
    }

    public function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * Сбросить кеш и сразу пересобрать.
     *
     * @return list<SitemapRow>
     */
    public function warm(): array
    {
        $this->forget();

        return $this->urls();
    }

    /**
     * @return list<SitemapRow>
     */
    private function build(): array
    {
        $byPath = [];

        $pages = CmsPage::query()
            ->where('is_active', true)
            ->select(['slug', 'name', 'h1', 'updated_at'])
            ->get();

        foreach ($pages as $page) {
            if ($page->slug === '') {
                continue;
            }
            $path = '/'.ltrim((string) $page->slug, '/');
            $title = trim((string) ($page->h1 ?: $page->name)) ?: null;
            $byPath[$path] = $this->row($path, $page->updated_at, 'page', $title);
        }

        $posts = CmsPost::query()
            ->where('is_active', true)
            ->whereNotNull('slug')
            ->select(['slug', 'title', 'updated_at'])
            ->get();

        foreach ($posts as $post) {
            if ($post->slug === null || $post->slug === '') {
                continue;
            }
            $path = '/'.ltrim((string) $post->slug, '/');
            if (isset($byPath[$path])) {
                continue;
            }
            $title = trim((string) $post->title) ?: null;
            $byPath[$path] = $this->row($path, $post->updated_at, 'post', $title);
        }

        $products = Product::query()
            ->where('is_active', true)
            ->whereExists(static function ($query): void {
                $query->selectRaw('1')
                    ->from('product_variant_links')
                    ->whereColumn('product_variant_links.product_id', 'products.id')
                    ->where('product_variant_links.is_active', true);
            })
            ->select(['slug', 'name', 'updated_at'])
            ->get();

        foreach ($products as $product) {
            if ($product->slug === '') {
                continue;
            }
            $path = '/'.$product->slug;
            $title = trim((string) $product->name) ?: null;
            $byPath[$path] = $this->row($path, $product->updated_at, 'product', $title);
        }

        $brands = Brand::query()
            ->where('is_active', true)
            ->select(['slug', 'name', 'updated_at'])
            ->get();

        foreach ($brands as $brand) {
            if ($brand->slug === '') {
                continue;
            }
            $path = '/brands/'.$brand->slug;
            if (isset($byPath[$path])) {
                continue;
            }
            $title = trim((string) $brand->name) ?: null;
            $byPath[$path] = $this->row($path, $brand->updated_at, 'brand', $title);
        }

        return array_values($byPath);
    }

    /**
     * @return SitemapRow
     */
    private function row(string $path, mixed $updatedAt, string $type, ?string $title): array
    {
        $iso = null;
        if ($updatedAt !== null) {
            $iso = Carbon::parse($updatedAt)->toAtomString();
        }

        return [
            'path' => $path,
            'lastModified' => $iso,
            'type' => $type,
            'title' => $title,
        ];
    }
}
