<?php

namespace Modules\ImportExport\Services\Allparfume;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\ImportExport\Models\AllparfumeProduct;

class AllparfumeIdFileImportService
{
    private const UNMATCHED_SAMPLE_LIMIT = 20;

    /**
     * @param  list<array{perfumer_url?:mixed,allparfume_url?:mixed,allparfume_id?:mixed}>  $items
     * @return array{
     *     updated:int,
     *     unmatched_slug:int,
     *     unmatched_allparfume_url:int,
     *     unmatched_slug_samples:list<string>,
     *     unmatched_allparfume_url_samples:list<string>
     * }
     */
    public function import(array $items): array
    {
        $stats = [
            'updated' => 0,
            'unmatched_slug' => 0,
            'unmatched_allparfume_url' => 0,
            'unmatched_slug_samples' => [],
            'unmatched_allparfume_url_samples' => [],
        ];

        $parsed = [];
        $slugs = [];
        foreach ($items as $item) {
            $row = $this->normalizeItem($item);
            if ($row === null) {
                continue;
            }
            $parsed[] = $row;
            foreach ($row['slugs'] as $slug) {
                $slugs[] = $slug;
            }
        }

        $productsBySlug = $this->loadProductsByIncomingSlugs(array_values(array_unique($slugs)));

        foreach ($parsed as $row) {
            $matchedById = [];
            foreach ($row['slugs'] as $index => $slug) {
                $catalog = $productsBySlug->get($slug);
                if (! $catalog instanceof Product) {
                    $stats['unmatched_slug']++;
                    $this->pushSample($stats['unmatched_slug_samples'], $row['perfumer_urls'][$index] ?? $slug);
                    continue;
                }
                $matchedById[(int) $catalog->id] = $catalog;
            }
            if ($matchedById === []) {
                continue;
            }

            $allparfumeProduct = $this->findAllparfumeProduct($row['brand_slug'], $row['external_slug']);
            if (! $allparfumeProduct instanceof AllparfumeProduct) {
                $stats['unmatched_allparfume_url']++;
                $this->pushSample($stats['unmatched_allparfume_url_samples'], $row['allparfume_url']);
                continue;
            }

            AllparfumeProduct::query()
                ->where('external_id', $row['allparfume_id'])
                ->where('id', '!=', $allparfumeProduct->id)
                ->update(['external_id' => null]);

            $catalogIds = array_map(static fn (Product $product): int => (int) $product->id, array_values($matchedById));
            $payload = is_array($allparfumeProduct->payload) ? $allparfumeProduct->payload : [];
            $payload['id_file_product_ids'] = $catalogIds;
            $payload['id_file_perfumer_urls'] = $row['perfumer_urls'];

            $first = reset($matchedById);
            $allparfumeProduct->fill([
                'external_id' => $row['allparfume_id'],
                'product_id' => $first instanceof Product ? $first->id : null,
                'match_status' => $allparfumeProduct->match_status === 'linked' ? 'linked' : 'suggested',
                'payload' => $payload,
            ]);
            $allparfumeProduct->save();
            $stats['updated']++;
        }

        return $stats;
    }

    /**
     * Ключ — slug из файла (текущий или From из seo-redirects).
     *
     * @param  list<string>  $slugs
     * @return Collection<string, Product>
     */
    private function loadProductsByIncomingSlugs(array $slugs): Collection
    {
        if ($slugs === []) {
            return collect();
        }

        $productsBySlug = Product::query()
            ->whereIn('slug', $slugs)
            ->get(['id', 'slug'])
            ->keyBy('slug');

        $missing = [];
        foreach ($slugs as $slug) {
            if (! $productsBySlug->has($slug)) {
                $missing[] = $slug;
            }
        }
        if ($missing === []) {
            return $productsBySlug;
        }

        $fromPaths = [];
        foreach ($missing as $slug) {
            $fromPaths[] = '/'.$slug;
            $fromPaths[] = '/'.$slug.'/';
        }

        $redirects = DB::table('seo_redirects')
            ->where('is_active', true)
            ->whereIn('from_path', array_values(array_unique($fromPaths)))
            ->whereNotNull('to_path')
            ->where('to_path', '!=', '')
            ->get(['from_path', 'to_path']);

        $fromSlugToTarget = [];
        $targetSlugs = [];
        foreach ($redirects as $redirect) {
            $fromSlug = trim((string) $redirect->from_path, '/');
            $targetSlug = $this->pathToSlug((string) $redirect->to_path);
            if ($fromSlug === '' || $targetSlug === '') {
                continue;
            }
            $fromSlugToTarget[$fromSlug] = $targetSlug;
            $targetSlugs[] = $targetSlug;
        }
        if ($targetSlugs === []) {
            return $productsBySlug;
        }

        $targets = Product::query()
            ->whereIn('slug', array_values(array_unique($targetSlugs)))
            ->get(['id', 'slug'])
            ->keyBy('slug');

        foreach ($fromSlugToTarget as $fromSlug => $targetSlug) {
            $catalog = $targets->get($targetSlug);
            if ($catalog instanceof Product && ! $productsBySlug->has($fromSlug)) {
                $productsBySlug->put($fromSlug, $catalog);
            }
        }

        return $productsBySlug;
    }

    /**
     * @param  array{perfumer_url?:mixed,allparfume_url?:mixed,allparfume_id?:mixed}  $item
     * @return array{slugs:list<string>,brand_slug:string,external_slug:string,allparfume_id:int,perfumer_urls:list<string>,allparfume_url:string}|null
     */
    private function normalizeItem(array $item): ?array
    {
        $id = (int) ($item['allparfume_id'] ?? 0);
        if ($id <= 0) {
            return null;
        }

        $perfumerUrls = self::normalizePerfumerUrls($item['perfumer_url'] ?? null);
        $allparfume = $this->parseAllparfumePath((string) ($item['allparfume_url'] ?? ''));
        if ($perfumerUrls === [] || $allparfume === null) {
            return null;
        }

        $slugs = [];
        foreach ($perfumerUrls as $url) {
            $slug = $this->pathToSlug($url);
            if ($slug === '') {
                return null;
            }
            $slugs[] = $slug;
        }

        return [
            'slugs' => $slugs,
            'brand_slug' => $allparfume['brand_slug'],
            'external_slug' => $allparfume['external_slug'],
            'allparfume_id' => $id,
            'perfumer_urls' => $perfumerUrls,
            'allparfume_url' => (string) ($item['allparfume_url'] ?? ''),
        ];
    }

    /**
     * @return list<string>
     */
    public static function normalizePerfumerUrls(mixed $value): array
    {
        if (is_string($value)) {
            $value = [$value];
        }
        if (! is_array($value)) {
            return [];
        }

        $urls = [];
        foreach ($value as $url) {
            if (! is_string($url)) {
                return [];
            }
            $url = trim($url);
            if ($url === '' || strlen($url) > 1000) {
                return [];
            }
            if (! in_array($url, $urls, true)) {
                $urls[] = $url;
            }
        }

        return $urls;
    }

    /**
     * @return array<string, mixed>
     */
    public static function itemValidationRules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1'],
            'items.*.perfumer_url' => ['required', function (string $attribute, mixed $value, \Closure $fail): void {
                if (self::normalizePerfumerUrls($value) === []) {
                    $fail('The '.$attribute.' field must be a URL or a list of URLs.');
                }
            }],
            'items.*.allparfume_url' => ['required', 'string', 'max:1000'],
            'items.*.allparfume_id' => ['required', 'integer', 'min:1'],
        ];
    }

    private function pathToSlug(string $url): string
    {
        $path = $this->urlPath($url);
        if ($path === '') {
            return '';
        }

        return trim($path, '/');
    }

    /**
     * @return array{brand_slug:string,external_slug:string}|null
     */
    private function parseAllparfumePath(string $url): ?array
    {
        $path = $this->urlPath($url);
        $path = trim($path, '/');
        if ($path === '') {
            return null;
        }

        if (! str_ends_with($path, '.html')) {
            $path = rtrim($path, '.').'.html';
        }

        $parts = explode('/', $path);
        if (count($parts) < 2) {
            return null;
        }

        $file = (string) array_pop($parts);
        $brandSlug = (string) array_pop($parts);
        $externalSlug = basename($file, '.html');
        if ($brandSlug === '' || $externalSlug === '') {
            return null;
        }

        return [
            'brand_slug' => $brandSlug,
            'external_slug' => $externalSlug,
        ];
    }

    private function urlPath(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }

        $path = parse_url($url, PHP_URL_PATH);
        if (! is_string($path) || $path === '') {
            $path = explode('?', $url, 2)[0];
        }

        return '/'.ltrim((string) $path, '/');
    }

    private function findAllparfumeProduct(string $brandSlug, string $externalSlug): ?AllparfumeProduct
    {
        return AllparfumeProduct::query()
            ->where('brand_slug', $brandSlug)
            ->where('external_slug', $externalSlug)
            ->first();
    }

    /**
     * @param  list<string>  $samples
     */
    private function pushSample(array &$samples, string $value): void
    {
        if (count($samples) >= self::UNMATCHED_SAMPLE_LIMIT) {
            return;
        }
        $value = trim($value);
        if ($value === '' || in_array($value, $samples, true)) {
            return;
        }
        $samples[] = $value;
    }
}
