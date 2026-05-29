<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;

class VanilleLinkCollector
{
    private const MAX_BRAND_PAGES = 20;

    /** Листинг бренда на Vanille: не больше 250 страниц × 24 товара. */
    private const MAX_LISTING_API_PAGES = 250;

    private const MSEARCH2_DEFAULT_ACTION = 'https://vanille.by/assets/components/msearch2/action.php';

    public function __construct(
        protected VanilleHttpClient $httpClient,
    ) {
    }

    /**
     * @param  list<array<string, mixed>>  $brands
     * @param  bool  $useBrandListingApi  true для пайплайнов «новый товар» / «спарсить все заново»
     */
    public function collect(
        array $brands,
        int $offset = 0,
        int $limit = 100,
        ?int $maxLinks = null,
        bool $useBrandListingApi = false,
    ): array {
        $chunk = array_slice($brands, $offset, $limit);
        $processed = count($chunk);

        $indexed = [];
        $log = [];
        $reachedMaxLinks = false;

        foreach ($chunk as $brand) {
            $url = $brand['source_url'] ?? ($brand['url'] ?? null);
            $brandName = $brand['name'] ?? 'unknown';

            if (!$url) {
                continue;
            }

            if (in_array(mb_strtolower(trim($brandName)), ['бренды', 'бренды парфюмерии'], true)) {
                continue;
            }

            $brandSlug = trim((string) ($brand['slug'] ?? ''));

            if (!VanilleBrandParser::isValidBrandSlug($brandSlug)) {
                continue;
            }

            if ($useBrandListingApi) {
                $found = $this->collectBrandLinksViaListingApi(
                    $brand,
                    $indexed,
                    $maxLinks,
                    $reachedMaxLinks,
                    $log
                );
            } else {
                $found = $this->collectBrandLinksLegacyHtml($brand, $indexed, $maxLinks, $reachedMaxLinks);
            }

            $suffix = $useBrandListingApi ? ' (listing)' : '';
            if ($found === 0) {
                $log[] = "SKIP empty brand: {$brandName} ({$brandSlug})";
            } else {
                $log[] = "{$brandName}: {$found}{$suffix}";
            }

            if ($reachedMaxLinks) {
                break;
            }
        }

        $allLinks = array_values($indexed);

        if ($maxLinks !== null) {
            $allLinks = array_slice($allLinks, 0, $maxLinks);
        }

        $nextOffset = $offset + $processed;
        $done = $reachedMaxLinks || $nextOffset >= count($brands);

        return [
            'links' => $allLinks,
            'log' => $log,
            'offset' => $offset,
            'limit' => $limit,
            'next_offset' => $nextOffset,
            'done' => $done,
            'processed_brands' => $processed,
            'total_brands' => count($brands),
            'max_links' => $maxLinks,
            'reached_max_links' => $reachedMaxLinks,
        ];
    }

    /**
     * @param  array<string, mixed>  $brand
     * @param  array<string, array{slug: string, url: string, brand: string}>  $indexed
     * @param  list<string>  $log
     */
    private function collectBrandLinksViaListingApi(
        array $brand,
        array &$indexed,
        ?int $maxLinks,
        bool &$reachedMaxLinks,
        array &$log,
    ): int {
        $url = $brand['source_url'] ?? ($brand['url'] ?? null);
        $brandName = (string) ($brand['name'] ?? 'unknown');
        $brandSlug = trim((string) ($brand['slug'] ?? ''));
        $pageUrl = $this->normalizeBrandListingUrl((string) $url);

        try {
            $jar = $this->httpClient->createCookieJar();
            $pageResponse = $this->httpClient->fetchUrlWithCookieJar($pageUrl, $jar, 15);
        } catch (\Throwable $e) {
            $log[] = "skip brand listing: {$brandName} -> " . $e->getMessage();

            return 0;
        }

        $pageHtml = $pageResponse['body'];
        $startCount = count($indexed);
        $config = $this->parseMse2Config($pageHtml);
        if ($config === null) {
            $log[] = "listing fallback html: {$brandName}";

            $this->extractProductLinksFromHtml(
                $pageHtml,
                $brandSlug,
                $brandName,
                $indexed,
                $maxLinks,
                $reachedMaxLinks,
                false
            );

            return count($indexed) - $startCount;
        }

        $found = 0;
        $totalPages = 1;
        $perPage = max(1, (int) ($config['limit'] ?? 24));
        $apiFailed = false;

        for ($page = 1; $page <= $totalPages && $page <= self::MAX_LISTING_API_PAGES; $page++) {
            try {
                $raw = $this->httpClient->postFormWithCookieJar(
                    (string) $config['action_url'],
                    [
                        'action' => 'filter',
                        'pageId' => (int) $config['page_id'],
                        'key' => (string) $config['key'],
                        'page' => $page,
                        'limit' => $perPage,
                    ],
                    $jar,
                    $pageUrl,
                    25,
                );
            } catch (\Throwable $e) {
                $apiFailed = true;
                if ($page === 1) {
                    $log[] = "listing api error: {$brandName} -> " . $e->getMessage();
                }
                break;
            }

            $payload = json_decode($raw, true);
            if (!is_array($payload) || !($payload['success'] ?? false)) {
                $apiFailed = true;
                if ($page === 1) {
                    $message = is_array($payload) ? (string) ($payload['message'] ?? 'unknown') : 'invalid json';
                    $log[] = "listing api error: {$brandName} -> {$message}";
                }
                break;
            }

            $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
            $totalPages = max(1, (int) ($data['pages'] ?? $totalPages));
            $html = (string) ($data['results'] ?? '');

            if ($html === '') {
                break;
            }

            $pageFound = $this->extractProductLinksFromHtml(
                $html,
                $brandSlug,
                $brandName,
                $indexed,
                $maxLinks,
                $reachedMaxLinks,
                false
            );
            $found += $pageFound;

            if ($reachedMaxLinks || $pageFound === 0) {
                break;
            }
        }

        if ($apiFailed || $found === 0) {
            $before = count($indexed);
            $this->extractProductLinksFromHtml(
                $pageHtml,
                $brandSlug,
                $brandName,
                $indexed,
                $maxLinks,
                $reachedMaxLinks,
                false
            );
            $fallbackAdded = count($indexed) - $before;
            if ($apiFailed && $fallbackAdded > 0) {
                $log[] = "listing partial html fallback: {$brandName} -> {$fallbackAdded}";
            }
        }

        return count($indexed) - $startCount;
    }

    /**
     * @param  array<string, mixed>  $brand
     * @param  array<string, array{slug: string, url: string, brand: string}>  $indexed
     */
    private function collectBrandLinksLegacyHtml(
        array $brand,
        array &$indexed,
        ?int $maxLinks,
        bool &$reachedMaxLinks,
    ): int {
        $url = $brand['source_url'] ?? ($brand['url'] ?? null);
        $brandName = $brand['name'] ?? 'unknown';
        $brandSlug = trim((string) ($brand['slug'] ?? ''));

        $found = 0;
        $emptyPagesInRow = 0;

        for ($page = 1; $page <= self::MAX_BRAND_PAGES; $page++) {
            $pageUrl = $this->appendPageToUrl((string) $url, $page);

            try {
                $html = $this->httpClient->fetchUrl($pageUrl, 10);
            } catch (\Throwable $e) {
                if ($page === 1) {
                    break;
                }
                break;
            }

            $pageFound = $this->extractProductLinksFromHtml(
                $html,
                $brandSlug,
                (string) $brandName,
                $indexed,
                $maxLinks,
                $reachedMaxLinks,
                true
            );
            $found += $pageFound;

            if ($reachedMaxLinks) {
                break;
            }

            if ($pageFound === 0) {
                $emptyPagesInRow++;
                if ($emptyPagesInRow >= 2) {
                    break;
                }
            } else {
                $emptyPagesInRow = 0;
            }
        }

        return $found;
    }

    /**
     * Проверка страницы бренда: mse2Config и счётчик #mse2_total (без сбора всех ссылок).
     *
     * @return array{config_ok: bool, total: int|null, log: list<string>}
     */
    public function probeBrandListingPage(string $pageUrl): array
    {
        $pageUrl = $this->normalizeBrandListingUrl($pageUrl);
        $log = [];

        try {
            $jar = $this->httpClient->createCookieJar();
            $pageResponse = $this->httpClient->fetchUrlWithCookieJar($pageUrl, $jar, 15);
        } catch (\Throwable $e) {
            return [
                'config_ok' => false,
                'total' => null,
                'log' => ['fetch: ' . $e->getMessage()],
            ];
        }

        $html = $pageResponse['body'];
        $config = $this->parseMse2Config($html);
        $total = $this->parseListingProductTotal($html);
        if ($total !== null) {
            $log[] = 'mse2_total: ' . $total;
        }

        return [
            'config_ok' => $config !== null,
            'total' => $total,
            'log' => $log,
        ];
    }

    public function parseListingProductTotal(string $html): ?int
    {
        if (preg_match('/id=["\']mse2_total["\'][^>]*>\s*(\d+)/iu', $html, $match)) {
            return (int) $match[1];
        }

        if (preg_match('/class=["\'][^"\']*mse2_total[^"\']*["\'][^>]*>\s*(\d+)/iu', $html, $match)) {
            return (int) $match[1];
        }

        return null;
    }

    private function normalizeBrandListingUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return 'https://vanille.by/';
        }

        if (!str_starts_with($url, 'http://') && !str_starts_with($url, 'https://')) {
            $url = 'https://vanille.by/' . ltrim($url, '/');
        }

        return rtrim($url, '/') . '/';
    }

    /**
     * @return array{action_url: string, key: string, page_id: int, limit: int}|null
     */
    private function parseMse2Config(string $html): ?array
    {
        if (!preg_match('/mse2Config\s*=\s*(\{.*?\});/s', $html, $matches)) {
            return null;
        }

        $config = json_decode($matches[1], true);
        if (!is_array($config)) {
            return null;
        }

        $key = trim((string) ($config['key'] ?? ''));
        $pageId = (int) ($config['pageId'] ?? 0);
        if ($key === '' || $pageId <= 0) {
            return null;
        }

        $actionUrl = trim((string) ($config['actionUrl'] ?? self::MSEARCH2_DEFAULT_ACTION));
        if ($actionUrl === '') {
            $actionUrl = self::MSEARCH2_DEFAULT_ACTION;
        }
        if (!str_starts_with($actionUrl, 'http://') && !str_starts_with($actionUrl, 'https://')) {
            $actionUrl = 'https://vanille.by' . (str_starts_with($actionUrl, '/') ? $actionUrl : '/' . $actionUrl);
        }

        $limit = (int) ($config['start_limit'] ?? $config['limit'] ?? 24);
        if ($limit <= 0) {
            $limit = 24;
        }

        return [
            'action_url' => $actionUrl,
            'key' => $key,
            'page_id' => $pageId,
            'limit' => $limit,
        ];
    }

    private function appendPageToUrl(string $url, int $page): string
    {
        if ($page <= 1) {
            return $url;
        }

        $separator = str_contains($url, '?') ? '&' : '?';

        return $url . $separator . 'page=' . $page;
    }

    /**
     * @param  array<string, array{slug: string, url: string, brand: string}>  $indexed
     */
    private function extractProductLinksFromHtml(
        string $html,
        string $brandSlug,
        string $brandName,
        array &$indexed,
        ?int $maxLinks,
        bool &$reachedMaxLinks,
        bool $requireBrandSlugPrefix,
    ): int {
        $hrefs = $requireBrandSlugPrefix
            ? $this->extractAllHrefs($html)
            : $this->extractProductCutHrefs($html);

        $found = 0;
        foreach ($hrefs as $href) {
            if (!$this->registerProductHref(
                $href,
                $brandSlug,
                $brandName,
                $indexed,
                $maxLinks,
                $reachedMaxLinks,
                $requireBrandSlugPrefix
            )) {
                continue;
            }

            $found++;
            if ($reachedMaxLinks) {
                break;
            }
        }

        return $found;
    }

    /**
     * @return list<string>
     */
    private function extractAllHrefs(string $html): array
    {
        preg_match_all('/href="([^"]+)"/isu', $html, $matches);

        $hrefs = [];
        foreach ($matches[1] as $href) {
            $hrefs[] = html_entity_decode(trim($href), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        return $hrefs;
    }

    /**
     * Ссылки только из карточек листинга (msearch2 results), без футера/куки/фавиконок.
     *
     * @return list<string>
     */
    private function extractProductCutHrefs(string $html): array
    {
        $hrefs = [];

        if (preg_match_all(
            '/class="[^"]*product-cut__title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"/isu',
            $html,
            $titleLinks
        )) {
            foreach ($titleLinks[1] as $href) {
                $hrefs[] = html_entity_decode(trim($href), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        if ($hrefs === [] && preg_match_all(
            '/<div[^>]+class="[^"]*\bproduct-cut\b[^"]*"[^>]*>(.*?)<\/div>\s*<\/div>/isu',
            $html,
            $blocks
        )) {
            foreach ($blocks[1] as $block) {
                if (!preg_match_all('/href="([^"]+)"/isu', $block, $blockLinks)) {
                    continue;
                }
                foreach ($blockLinks[1] as $href) {
                    $hrefs[] = html_entity_decode(trim($href), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                }
            }
        }

        // Fallback: некоторые шаблоны Vanille могут менять структуру product-cut,
        // но в msearch2 results остаются только карточки + пагинация.
        // Берём все href и отфильтруем ниже по slug/исключениям.
        if ($hrefs === []) {
            $hrefs = $this->extractAllHrefs($html);
        }

        return array_values(array_unique($hrefs));
    }

    /**
     * @param  array<string, array{slug: string, url: string, brand: string}>  $indexed
     */
    private function registerProductHref(
        string $href,
        string $brandSlug,
        string $brandName,
        array &$indexed,
        ?int $maxLinks,
        bool &$reachedMaxLinks,
        bool $requireBrandSlugPrefix,
    ): bool {
        $href = trim($href);
        if ($href === '' || str_starts_with($href, '#')) {
            return false;
        }

        $href = preg_replace('/#.*$/', '', $href);
        if ($href === '') {
            return false;
        }

        $fullUrl = str_starts_with($href, 'http://') || str_starts_with($href, 'https://')
            ? $href
            : 'https://vanille.by' . (str_starts_with($href, '/') ? $href : '/' . $href);

        $host = mb_strtolower((string) parse_url($fullUrl, PHP_URL_HOST));
        if ($host !== '' && !in_array($host, ['vanille.by', 'www.vanille.by'], true)) {
            return false;
        }

        $parsedPath = parse_url($fullUrl, PHP_URL_PATH) ?? '';
        $slug = trim($parsedPath, '/');

        if (!$this->isValidProductSlug($slug, $brandSlug)) {
            return false;
        }

        if ($requireBrandSlugPrefix) {
            $normalizedSlug = mb_strtolower($slug);
            $normalizedBrandSlug = mb_strtolower($brandSlug);
            if (
                $normalizedBrandSlug !== ''
                && !str_starts_with($normalizedSlug, $normalizedBrandSlug . '-')
                && !str_contains($normalizedSlug, '-' . $normalizedBrandSlug . '-')
                && !str_ends_with($normalizedSlug, '-' . $normalizedBrandSlug)
            ) {
                return false;
            }
        }

        $canonicalUrl = 'https://vanille.by/' . $slug;
        if (isset($indexed[$canonicalUrl])) {
            return false;
        }

        $indexed[$canonicalUrl] = [
            'slug' => $slug,
            'url' => $canonicalUrl,
            'brand' => $brandName,
            'brand_slug' => $brandSlug,
        ];

        if ($maxLinks !== null && count($indexed) >= $maxLinks) {
            $reachedMaxLinks = true;
        }

        return true;
    }

    private function isValidProductSlug(string $slug, string $brandSlug): bool
    {
        if (!VanilleBrandParser::isValidBrandSlug($slug)) {
            return false;
        }

        if ($slug === $brandSlug) {
            return false;
        }

        if (in_array($slug, $this->excludedListingSlugs(), true)) {
            return false;
        }

        return true;
    }

    /**
     * @return list<string>
     */
    private function excludedListingSlugs(): array
    {
        return [
            'brendyi',
            'skidki',
            'dostavka',
            'kontaktyi',
            'otzyivyi-o-magazine',
            'o-magazine',
            'akczii-i-novosti',
            'parfyumeriya-optom',
            'poryadok-obrabotki-obrashhenij',
            'parfumeriya-dlya-zhenshhin',
            'parfumeriya-dlya-muzhchin',
            'parfumeriya-uniseks',
            'otlivant-duhi-na-razliv',
            'ostatki-vo-flakonax',
            'aroma-box',
            'poisk',
            'sale',
            'shop',
            'oplata',
            'catalog',
            'novinki',
            'lyuks',
            'selektivnaya',
            'lideryi-prodazh',
            'limited-edition',
            'celebrity',
            'klassika',
            'arabskaya',
            'top-100-women',
            'top-100-men',
            'top-100-unisex',
            'atomajzeryi',
            'sertifikat',
            'podarochnyie-naboryi',
            'lk',
            'oformlenie',
            'izbrannyie',
            'prosmotrennyie',
        ];
    }
}
