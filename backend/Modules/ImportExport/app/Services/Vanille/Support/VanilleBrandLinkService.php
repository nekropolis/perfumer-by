<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleLinkCollector;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleProductParser;
use RuntimeException;

class VanilleBrandLinkService
{
    public function __construct(
        protected VanilleLinkCollector $linkCollector,
        protected VanilleHttpClient $httpClient,
        protected VanilleProductParser $productParser,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function findBrandRow(string $brandSlug): ?array
    {
        $brandSlug = mb_strtolower(trim($brandSlug), 'UTF-8');
        $path = $this->brandsPath();
        if (!is_file($path)) {
            return null;
        }

        $brands = json_decode((string) file_get_contents($path), true);
        if (!is_array($brands)) {
            return null;
        }

        foreach (VanilleBrandParser::filterExcludedListingRows($brands) as $row) {
            if (!is_array($row)) {
                continue;
            }
            if (mb_strtolower(trim((string) ($row['slug'] ?? '')), 'UTF-8') === $brandSlug) {
                return $row;
            }
        }

        return null;
    }

    /**
     * Сбор ссылок с листинга бренда (msearch2), без записи на диск.
     *
     * @return array{links: list<array<string, mixed>>, log: list<string>, count: int}
     */
    public function collectBrandListingLinks(string $brandSlug): array
    {
        $brand = $this->findBrandRow($brandSlug);
        if ($brand === null) {
            throw new RuntimeException("Бренд «{$brandSlug}» не найден в brands.json (или отфильтрован как категория).");
        }

        $result = $this->linkCollector->collect([$brand], 0, 1, null, true);
        $links = is_array($result['links'] ?? null) ? $result['links'] : [];

        return [
            'brand' => $brand,
            'links' => array_values($links),
            'log' => is_array($result['log'] ?? null) ? $result['log'] : [],
            'count' => count($links),
        ];
    }

    /**
     * @return array{
     *   ok: bool,
     *   brand_slug: string,
     *   brand_name: string,
     *   vanille_total: int|null,
     *   collected: int,
     *   expected: int|null,
     *   wrong_brand_labels: int,
     *   sample_url: string|null,
     *   sample_fetch_ok: bool|null,
     *   issues: list<string>,
     *   log: list<string>
     * }
     */
    public function preflight(string $brandSlug, ?int $expectedTotal = null, int $minCollected = 1): array
    {
        $brandSlug = mb_strtolower(trim($brandSlug), 'UTF-8');
        $issues = [];
        $brand = $this->findBrandRow($brandSlug);

        if ($brand === null) {
            return $this->preflightFail($brandSlug, '', null, 0, $expectedTotal, [
                'Бренд не найден в brands.json. Сначала: парсинг брендов Vanille.',
            ]);
        }

        $brandName = trim((string) ($brand['name'] ?? ''));
        $pageUrl = trim((string) ($brand['source_url'] ?? $brand['url'] ?? ''));
        if ($pageUrl === '') {
            $pageUrl = 'https://vanille.by/' . $brandSlug;
        }

        $probe = $this->linkCollector->probeBrandListingPage($pageUrl);
        $vanilleTotal = $probe['total'];
        $log = is_array($probe['log'] ?? null) ? $probe['log'] : [];

        if (!($probe['config_ok'] ?? false)) {
            $issues[] = 'Не удалось прочитать mse2Config со страницы бренда (сессия/cookie или шаблон страницы).';
        }

        if ($vanilleTotal !== null && $expectedTotal !== null && $vanilleTotal < $expectedTotal) {
            $issues[] = "На Vanille в счётчике {$vanilleTotal} товаров, ожидали ≥ {$expectedTotal}.";
        }

        try {
            $collected = $this->collectBrandListingLinks($brandSlug);
        } catch (\Throwable $e) {
            return $this->preflightFail($brandSlug, $brandName, $vanilleTotal, 0, $expectedTotal, [
                'Сбор ссылок: ' . $e->getMessage(),
            ], $log);
        }

        $links = $collected['links'];
        $count = count($links);
        $log = array_merge($log, $collected['log']);

        $wrongBrand = 0;
        $normalizedBrand = mb_strtolower($brandName, 'UTF-8');
        foreach ($links as $link) {
            $label = mb_strtolower(trim((string) ($link['brand'] ?? '')), 'UTF-8');
            if ($label !== $normalizedBrand) {
                $wrongBrand++;
            }
        }

        if ($wrongBrand > 0) {
            $issues[] = "У {$wrongBrand} ссылок поле brand не «{$brandName}» (похоже на сбор с категории, а не бренда).";
        }

        if ($count < $minCollected) {
            $issues[] = "Собрано только {$count} ссылок (минимум {$minCollected}).";
        }

        if ($vanilleTotal !== null && $count > 0 && $count < (int) floor($vanilleTotal * 0.9)) {
            $issues[] = "Собрано {$count} из {$vanilleTotal} по счётчику Vanille — проверьте listing API.";
        }

        if ($expectedTotal !== null && $count < $expectedTotal) {
            $issues[] = "Собрано {$count}, ожидали ≥ {$expectedTotal}.";
        }

        $sampleUrl = isset($links[0]['url']) ? trim((string) $links[0]['url']) : null;
        $sampleOk = null;
        if ($sampleUrl !== null && $sampleUrl !== '') {
            try {
                $this->productParser->parseProductPage($sampleUrl);
                $sampleOk = true;
            } catch (\Throwable $e) {
                $sampleOk = false;
                $issues[] = 'Тестовая карточка не открылась: ' . $sampleUrl . ' — ' . $e->getMessage();
            }
        }

        return [
            'ok' => $issues === [],
            'brand_slug' => $brandSlug,
            'brand_name' => $brandName,
            'vanille_total' => $vanilleTotal,
            'collected' => $count,
            'expected' => $expectedTotal,
            'wrong_brand_labels' => $wrongBrand,
            'sample_url' => $sampleUrl,
            'sample_fetch_ok' => $sampleOk,
            'issues' => $issues,
            'log' => $log,
        ];
    }

    /**
     * Сохранить ссылки бренда и обновить product_links.json (убрать старые URL этого бренда).
     *
     * @return array{brand_file: string, main_file: string, collected: int, removed: int, total_main: int}
     */
    public function collectAndMerge(string $brandSlug): array
    {
        $collected = $this->collectBrandListingLinks($brandSlug);
        $links = $collected['links'];
        $brand = $collected['brand'];
        $brandName = trim((string) ($brand['name'] ?? ''));

        $brandFile = $this->brandLinksPath($brandSlug);
        file_put_contents(
            $brandFile,
            json_encode($links, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        $patterns = $this->slugPrefixPatternsForLinks($links, $brandSlug);
        $mainPath = $this->productLinksPath();
        $existing = $this->loadLinksFile($mainPath);
        $removed = 0;
        $kept = [];

        foreach ($existing as $link) {
            if ($this->linkBelongsToBrand($link, $brandSlug, $brandName, $patterns)) {
                $removed++;

                continue;
            }
            $kept[] = $link;
        }

        $merged = $this->dedupeLinksByUrl([...$kept, ...$links]);
        file_put_contents(
            $mainPath,
            json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        return [
            'brand_file' => $brandFile,
            'main_file' => $mainPath,
            'collected' => count($links),
            'removed' => $removed,
            'total_main' => count($merged),
            'log' => $collected['log'],
        ];
    }

    public function brandLinksPath(string $brandSlug): string
    {
        $slug = mb_strtolower(trim($brandSlug), 'UTF-8');

        return $this->importDir() . '/product_links_brand_' . $slug . '.json';
    }

    /**
     * @return array{collected: int, parsed_in_file: int, pending: int, errors: int}
     */
    public function countBrandParseProgress(string $brandSlug): array
    {
        $path = $this->brandLinksPath($brandSlug);
        if (!is_file($path)) {
            return ['collected' => 0, 'parsed_in_file' => 0, 'pending' => 0, 'errors' => 0];
        }

        $links = $this->loadLinksFile($path);
        $parsed = $this->loadParsedUrlKeys();
        $errors = $this->loadParseErrorUrlKeys();
        $parsedN = 0;
        $errN = 0;
        $pending = 0;

        foreach ($links as $link) {
            $key = $this->normalizeUrlKey((string) ($link['url'] ?? ''));
            if ($key === '') {
                continue;
            }
            if (isset($errors[$key])) {
                $errN++;

                continue;
            }
            if (isset($parsed[$key])) {
                $parsedN++;

                continue;
            }
            $pending++;
        }

        return [
            'collected' => count($links),
            'parsed_in_file' => $parsedN,
            'pending' => $pending,
            'errors' => $errN,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $links
     * @return list<string>
     */
    public function slugPrefixPatternsForLinks(array $links, string $brandSlug): array
    {
        $patterns = [mb_strtolower($brandSlug, 'UTF-8') . '-'];
        foreach ($links as $link) {
            $slug = mb_strtolower(trim((string) ($link['slug'] ?? '')), 'UTF-8');
            if ($slug === '' || !str_contains($slug, '-')) {
                continue;
            }
            $first = explode('-', $slug, 2)[0];
            if ($first !== '') {
                $patterns[] = $first . '-';
            }
            if (str_contains($slug, '-')) {
                $parts = explode('-', $slug, 3);
                if (count($parts) >= 2) {
                    $patterns[] = $parts[0] . '-' . $parts[1] . '-';
                }
            }
        }

        return array_values(array_unique($patterns));
    }

    /**
     * @param  array<string, mixed>  $link
     * @param  list<string>  $patterns
     */
    public function linkBelongsToBrand(array $link, string $brandSlug, string $brandName, array $patterns): bool
    {
        $slug = mb_strtolower(trim((string) ($link['slug'] ?? '')), 'UTF-8');
        if ($slug === $brandSlug) {
            return true;
        }

        foreach ($patterns as $pattern) {
            if ($pattern !== '' && str_starts_with($slug, $pattern)) {
                return true;
            }
        }

        $label = mb_strtolower(trim((string) ($link['brand'] ?? '')), 'UTF-8');
        $name = mb_strtolower(trim($brandName), 'UTF-8');

        return $name !== '' && $label === $name;
    }

    private function preflightFail(
        string $brandSlug,
        string $brandName,
        ?int $vanilleTotal,
        int $collected,
        ?int $expected,
        array $issues,
        array $log = [],
    ): array {
        return [
            'ok' => false,
            'brand_slug' => $brandSlug,
            'brand_name' => $brandName,
            'vanille_total' => $vanilleTotal,
            'collected' => $collected,
            'expected' => $expected,
            'wrong_brand_labels' => 0,
            'sample_url' => null,
            'sample_fetch_ok' => null,
            'issues' => $issues,
            'log' => $log,
        ];
    }

    private function importDir(): string
    {
        return storage_path('app/public/imports/vanille');
    }

    private function brandsPath(): string
    {
        return $this->importDir() . '/brands.json';
    }

    private function productLinksPath(): string
    {
        return $this->importDir() . '/product_links.json';
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadLinksFile(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param  list<array<string, mixed>>  $links
     * @return list<array<string, mixed>>
     */
    private function dedupeLinksByUrl(array $links): array
    {
        $out = [];
        foreach ($links as $link) {
            if (!is_array($link)) {
                continue;
            }
            $key = $this->normalizeUrlKey((string) ($link['url'] ?? ''));
            if ($key === '') {
                continue;
            }
            $out[$key] = $link;
        }

        return array_values($out);
    }

    private function normalizeUrlKey(string $url): string
    {
        $normalized = preg_replace('/[?#].*$/', '', trim($url)) ?? '';
        if ($normalized !== '/' && str_ends_with($normalized, '/')) {
            $normalized = rtrim($normalized, '/');
        }

        return mb_strtolower($normalized, 'UTF-8');
    }

    /**
     * @return array<string, bool>
     */
    private function loadParsedUrlKeys(): array
    {
        $path = $this->importDir() . '/parsed_urls.json';
        if (!is_file($path)) {
            return [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        $set = [];
        foreach ((array) ($decoded['urls'] ?? []) as $url) {
            $key = $this->normalizeUrlKey((string) $url);
            if ($key !== '') {
                $set[$key] = true;
            }
        }

        return $set;
    }

    /**
     * @return array<string, bool>
     */
    private function loadParseErrorUrlKeys(): array
    {
        $path = $this->importDir() . '/parse_errors.json';
        if (!is_file($path)) {
            return [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        $set = [];
        foreach ((array) ($decoded['errors'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $key = $this->normalizeUrlKey((string) ($row['url'] ?? ''));
            if ($key !== '') {
                $set[$key] = true;
            }
        }

        return $set;
    }
}
