<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;

class VanilleBrandParser
{
    /** @var list<array<string, mixed>>|null */
    private static ?array $catalogBrandRowsCache = null;

    private static ?int $catalogBrandRowsCacheMtime = null;

    /** @var list<array<string, mixed>>|null */
    private static ?array $catalogBrandRowsByPathLengthCache = null;
    /** Slug-пути страницы /brendyi, которые не являются брендами (личный кабинет, страны и т. п.). */
    private static function excludedVanilleListingSlugList(): array
    {
        return [
            'akczii-i-novosti',
            'aldegidnyie',
            'arabskie-emiratyi',
            'aromat',
            'aromatnyie',
            'aromaty',
            'baxrejn',
            'brendyi',
            'catalog',
            'cookie-policy',
            'dostavka',
            'francziya',
            'germaniya',
            'ispaniya',
            'italiya',
            'izbrannyie',
            'kozhanyie',
            'kontaktyi',
            'lk',
            'o-magazine',
            'oformlenie',
            'oplata',
            'politika-konfidencialnosti',
            'polzovatelskoe-soglashenie',
            'oman',
            'orientalnyie',
            'otzyivyi-o-magazine',
            'parfiumernaia',
            'parfyumeriya-optom',
            'polsha',
            'prosmotrennyie',
            'pryanyie',
            'sale',
            'shop',
            'skidki',
            'ssha',
            'usloviya-vozvrata',
            'vanilnyie',
            'velikobritaniya',
            'yaponiya',
            'shvejczariya',
            'lucsie',
            'czvetochnyie',
            'czitrusovyie',
            'muskusnyie',
            'fruktovyie',
            'fuzhernyie',
            'zhirinovskij',
            'vodnyie',
            'vostochnyie',
            'drevesnyie',
            'svezhie',
            'stranyi',
            'rossiya',
            'probniki',
            'tualetnyie-duxi',
            'tualetnaya-voda',
            'odekolonyi',
            'duxi',
            'parfumeriya-dlya-zhenshhin',
            'parfumeriya-dlya-muzhchin',
            'parfumeriya-uniseks',
            'lideryi-prodazh',
            'novinki',
            'lyuks',
            'selektivnaya',
            'limited-edition',
            'aromat-2024',
            'aromat-2023',
            'celebrity',
            'klassika',
            'arabskaya',
            'top-100-women',
            'top-100-men',
            'top-100-unisex',
            'atomajzeryi',
            'otlivant-duhi-na-razliv',
            'ostatki-vo-flakonax',
            'angliyskie',
            'ispanskie',
            'amerikanskie',
            'franczuzskie',
            'nemeczkie',
            'rossiyskie',
            'italyanskie',
            'arabskie',
        ];
    }

    /** @return list<string> */
    public static function excludedVanilleListingSlugs(): array
    {
        return self::excludedVanilleListingSlugList();
    }

    public static function isExcludedListingSlug(string $slug): bool
    {
        $slug = mb_strtolower(trim($slug), 'UTF-8');
        if ($slug === '') {
            return false;
        }

        static $lookup = null;
        if ($lookup === null) {
            $lookup = array_fill_keys(self::excludedVanilleListingSlugList(), true);
        }

        return isset($lookup[$slug]);
    }

    /**
     * Отфильтровать строки из brands.json (устаревший файл может содержать исключённые slug до перепарса).
     *
     * @param  array<int, mixed>  $brands
     * @return list<array<string, mixed>>
     */
    public static function filterExcludedListingRows(array $brands): array
    {
        $out = [];
        foreach ($brands as $row) {
            if (!is_array($row)) {
                continue;
            }

            $slug = trim((string) ($row['slug'] ?? ''));
            if ($slug === '') {
                continue;
            }

            if (self::isExcludedListingSlug($slug)) {
                continue;
            }

            if (!self::isValidBrandSlug($slug)) {
                continue;
            }

            $name = trim((string) ($row['name'] ?? ''));
            $sourceUrl = trim((string) ($row['source_url'] ?? $row['url'] ?? ''));

            if (self::isExcludedBrandName($name)) {
                continue;
            }

            if (self::isGarbageBrandRow($name, $slug, $sourceUrl)) {
                continue;
            }

            $out[] = $row;
        }

        return $out;
    }

    public function __construct(
        protected VanilleHttpClient $httpClient,
    ) {
    }

    public function parse(): array
    {
        $url = 'https://vanille.by/brendyi';
        $html = $this->httpClient->fetchUrl($url, 10);

        preg_match_all('/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/isu', $html, $matches, PREG_SET_ORDER);

        $brands = [];

        foreach ($matches as $match) {
            $href = html_entity_decode(trim($match[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');

            $rawName = html_entity_decode($match[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $rawName = preg_replace('/<span\b[^>]*\bbrend-count\b[^>]*>.*?<\/span>/isu', '', $rawName);
            $rawName = preg_replace('/<(small|sup)\b[^>]*>.*?<\/\\1>/isu', '', $rawName);
            $name = trim(strip_tags($rawName));

            if ($name === '') {
                continue;
            }

            $slug = null;
            $vendor = null;
            $sourceUrl = null;
            $publicUrl = null;

            if (str_starts_with($href, '/poisk?') || str_contains($href, 'query=')) {
                $queryString = parse_url($href, PHP_URL_QUERY) ?? '';
                parse_str($queryString, $query);

                $slug = trim((string) ($query['query'] ?? ''));
                $vendor = trim((string) ($query['vendor'] ?? ''));
                $sourceUrl = str_starts_with($href, 'http')
                    ? $href
                    : 'https://vanille.by' . $href;
                $publicUrl = $slug ? 'https://vanille.by/' . $slug : null;
            } else {
                $path = parse_url($href, PHP_URL_PATH) ?? '';
                $path = trim($path, '/');

                if ($path !== '' && !str_contains($path, '/')) {
                    $slug = $path;
                    $sourceUrl = str_starts_with($href, 'http')
                        ? $href
                        : 'https://vanille.by/' . ltrim($path, '/');
                    $publicUrl = 'https://vanille.by/' . $slug;
                }
            }

            if (!$slug) {
                continue;
            }

            if (self::isExcludedListingSlug($slug)) {
                continue;
            }

            if (mb_strlen($name) > 80) {
                continue;
            }

            if (in_array(mb_strtolower($name), ['бренды', 'бренды парфюмерии'], true)) {
                continue;
            }

            if (preg_match('/каталог|магазин|доставка|отзывы|скидки/i', $name)) {
                continue;
            }

            if (self::isExcludedBrandName($name)) {
                continue;
            }

            if (self::isGarbageBrandRow($name, $slug, $sourceUrl ?? '')) {
                continue;
            }

            if (!self::isValidBrandSlug($slug)) {
                continue;
            }

            $brands[$slug] = [
                'name' => $name,
                'slug' => $slug,
                'vendor' => $vendor ?: null,
                'url' => $publicUrl,
                'source_url' => $sourceUrl,
            ];
        }

        return array_values($brands);
    }

    public static function isValidBrandSlug(string $slug): bool
    {
        $slug = mb_strtolower(trim($slug), 'UTF-8');
        if ($slug === '' || str_contains($slug, '/') || str_contains($slug, ':') || str_contains($slug, '@')) {
            return false;
        }

        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            return false;
        }

        if (preg_match('/\.(?:ico|png|jpe?g|gif|webp|svg|webmanifest|css|js|xml|pdf)$/i', $slug)) {
            return false;
        }

        return !self::isExcludedListingSlug($slug);
    }

    /**
     * Бренд из актуального brands.json (после filterExcludedListingRows).
     *
     * @return array<string, mixed>|null
     */
    public static function findCatalogBrandRow(string $brandName, string $productUrl = ''): ?array
    {
        $brandName = self::normalizeBrandLookupName($brandName);
        if ($brandName === '') {
            return null;
        }

        foreach (self::catalogBrandLookupNames($brandName) as $lookupName) {
            $needle = mb_strtolower($lookupName, 'UTF-8');

            foreach (self::loadCatalogBrandRows() as $row) {
                $rowName = self::normalizeBrandLookupName((string) ($row['name'] ?? ''));
                if ($rowName === '') {
                    continue;
                }

                if (
                    mb_strtolower($rowName, 'UTF-8') === $needle
                    || ProductDisplayName::brandNamesEquivalent($lookupName, $rowName)
                ) {
                    return $row;
                }
            }
        }

        $productUrl = trim($productUrl);
        if ($productUrl !== '') {
            $path = mb_strtolower(trim((string) parse_url($productUrl, PHP_URL_PATH), '/'), 'UTF-8');
            if ($path !== '') {
                $byPath = self::findCatalogBrandRowByProductPath($path);
                if ($byPath !== null) {
                    return $byPath;
                }
            }

            $slug = self::inferBrandSlugFromProductUrl($brandName, $productUrl);
            if ($slug !== '') {
                $bySlug = self::findCatalogBrandRowBySlug($slug);
                if ($bySlug !== null) {
                    return $bySlug;
                }
            }
        }

        foreach (self::brandSlugCandidatesFromName($brandName) as $candidate) {
            $bySlug = self::findCatalogBrandRowBySlug($candidate);
            if ($bySlug !== null) {
                return $bySlug;
            }
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private static function catalogBrandLookupNames(string $brandName): array
    {
        $names = [$brandName];
        $lower = mb_strtolower($brandName, 'UTF-8');
        if ($lower === 'christian dior' || str_starts_with($lower, 'christian dior ')) {
            $names[] = 'Dior';
        }

        return array_values(array_unique($names));
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function findCatalogBrandRowByProductPath(string $path): ?array
    {
        foreach (self::catalogBrandRowsSortedBySlugLength() as $row) {
            $slug = mb_strtolower(trim((string) ($row['slug'] ?? '')), 'UTF-8');
            if ($slug === '' || self::isExcludedListingSlug($slug)) {
                continue;
            }

            if ($path === $slug || str_starts_with($path, $slug . '-')) {
                return $row;
            }
        }

        if ($path === 'christian-dior' || str_starts_with($path, 'christian-dior-')) {
            return self::findCatalogBrandRowBySlug('dior');
        }

        return null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function catalogBrandRowsSortedBySlugLength(): array
    {
        if (self::$catalogBrandRowsByPathLengthCache !== null) {
            return self::$catalogBrandRowsByPathLengthCache;
        }

        $rows = self::loadCatalogBrandRows();
        usort($rows, static function (array $a, array $b): int {
            $lenA = strlen((string) ($a['slug'] ?? ''));
            $lenB = strlen((string) ($b['slug'] ?? ''));

            return $lenB <=> $lenA;
        });

        self::$catalogBrandRowsByPathLengthCache = $rows;

        return self::$catalogBrandRowsByPathLengthCache;
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function findCatalogBrandRowBySlug(string $slug): ?array
    {
        $slug = mb_strtolower(trim($slug), 'UTF-8');
        if ($slug === '') {
            return null;
        }

        foreach (self::loadCatalogBrandRows() as $row) {
            $rowSlug = mb_strtolower(trim((string) ($row['slug'] ?? '')), 'UTF-8');
            if ($rowSlug !== '' && $rowSlug === $slug) {
                return $row;
            }
        }

        return null;
    }

    public static function isAllowedImportBrand(string $brandName, string $productUrl = ''): bool
    {
        if (trim($brandName) === '') {
            return false;
        }

        return self::findCatalogBrandRow($brandName, $productUrl) !== null;
    }

    public static function normalizeBrandLookupName(string $name): string
    {
        $name = trim($name);
        if ($name === '') {
            return '';
        }

        $name = str_replace(
            ["\u{2019}", "\u{2018}", "\u{02BC}", '`', '´'],
            "'",
            $name,
        );
        $name = preg_replace('/\s+/u', ' ', $name) ?? '';

        return trim($name);
    }

    /**
     * Одиночный импорт из админки: дописать бренд в brands.json, если его ещё нет после полного парсинга /brendyi.
     *
     * @return array<string, mixed>|null
     */
    public static function ensureBrandRowInCatalogFile(string $brandName, string $productUrl = ''): ?array
    {
        $brandName = trim($brandName);
        if ($brandName === '') {
            return null;
        }

        $productUrl = trim($productUrl);
        $existing = self::findCatalogBrandRow($brandName, $productUrl);
        if ($existing !== null) {
            return $existing;
        }

        if (self::isExcludedBrandName($brandName) || self::isGarbageBrandRow($brandName, '', $productUrl)) {
            return null;
        }

        $slug = self::inferBrandSlugFromProductUrl($brandName, $productUrl);
        if ($slug === '' || ! self::isValidBrandSlug($slug) || self::isExcludedListingSlug($slug)) {
            return null;
        }

        $bySlug = self::findCatalogBrandRowBySlug($slug);
        if ($bySlug !== null) {
            return $bySlug;
        }

        $row = [
            'name' => $brandName,
            'slug' => $slug,
            'vendor' => null,
            'url' => 'https://vanille.by/' . $slug,
            'source_url' => 'https://vanille.by/' . $slug,
        ];

        $appended = self::appendBrandRowToCatalogFile($row);
        if ($appended !== null) {
            return $appended;
        }

        return self::findCatalogBrandRow($brandName, $productUrl)
            ?? self::findCatalogBrandRowBySlug($slug);
    }

    /**
     * @return list<string>
     */
    public static function brandSlugCandidatesFromName(string $brandName): array
    {
        $slug = VanilleHelper::slugify($brandName);
        $candidates = [$slug];

        $compactL = preg_replace('/^l-/', 'l', $slug);
        if (is_string($compactL) && $compactL !== '' && $compactL !== $slug) {
            $candidates[] = $compactL;
        }

        $noApostrophe = VanilleHelper::slugify(str_replace("'", '', $brandName));
        if ($noApostrophe !== '' && $noApostrophe !== $slug) {
            $candidates[] = $noApostrophe;
        }

        return array_values(array_unique(array_filter($candidates)));
    }

    public static function inferBrandSlugFromProductUrl(string $brandName, string $productUrl): string
    {
        $path = trim((string) parse_url($productUrl, PHP_URL_PATH), '/');

        foreach (self::brandSlugCandidatesFromName($brandName) as $candidate) {
            if ($path !== '' && ($path === $candidate || str_starts_with($path, $candidate . '-'))) {
                return $candidate;
            }
        }

        if ($path !== '') {
            $parts = explode('-', $path);
            for ($len = count($parts) - 1; $len >= 1; $len--) {
                $candidate = implode('-', array_slice($parts, 0, $len));
                if (self::isValidBrandSlug($candidate) && ! self::isExcludedListingSlug($candidate)) {
                    return $candidate;
                }
            }
        }

        $fallback = VanilleHelper::slugify($brandName);

        return self::isValidBrandSlug($fallback) ? $fallback : '';
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private static function appendBrandRowToCatalogFile(array $row): ?array
    {
        $path = storage_path('app/public/imports/vanille/brands.json');
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $brands = [];
        if (is_file($path)) {
            $decoded = json_decode((string) file_get_contents($path), true);
            if (is_array($decoded)) {
                $brands = $decoded;
            }
        }

        $slug = mb_strtolower(trim((string) ($row['slug'] ?? '')), 'UTF-8');
        $name = trim((string) ($row['name'] ?? ''));

        foreach ($brands as $existing) {
            if (! is_array($existing)) {
                continue;
            }
            $existingSlug = mb_strtolower(trim((string) ($existing['slug'] ?? '')), 'UTF-8');
            if ($slug !== '' && $existingSlug === $slug) {
                self::resetCatalogBrandRowsCache();

                return $existing;
            }
            if ($name !== '' && ProductDisplayName::brandNamesEquivalent($name, (string) ($existing['name'] ?? ''))) {
                self::resetCatalogBrandRowsCache();

                return $existing;
            }
        }

        $brands[] = $row;

        file_put_contents(
            $path,
            json_encode($brands, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        self::resetCatalogBrandRowsCache();

        return $row;
    }

    public static function resetCatalogBrandRowsCache(): void
    {
        self::$catalogBrandRowsCache = null;
        self::$catalogBrandRowsCacheMtime = null;
        self::$catalogBrandRowsByPathLengthCache = null;
    }

    /**
     * @internal
     *
     * @param  list<array<string, mixed>>  $rows
     */
    public static function seedCatalogBrandRowsCacheForTests(array $rows): void
    {
        self::$catalogBrandRowsCache = $rows;
        self::$catalogBrandRowsCacheMtime = PHP_INT_MAX;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function loadCatalogBrandRows(): array
    {
        if (self::$catalogBrandRowsCache !== null && self::$catalogBrandRowsCacheMtime === PHP_INT_MAX) {
            return self::$catalogBrandRowsCache;
        }

        $path = storage_path('app/public/imports/vanille/brands.json');
        if (! is_file($path)) {
            self::resetCatalogBrandRowsCache();
            self::$catalogBrandRowsCache = [];

            return self::$catalogBrandRowsCache;
        }

        $mtime = (int) filemtime($path);
        if (
            self::$catalogBrandRowsCache !== null
            && self::$catalogBrandRowsCacheMtime === $mtime
        ) {
            return self::$catalogBrandRowsCache;
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (! is_array($decoded)) {
            self::resetCatalogBrandRowsCache();

            return [];
        }

        self::$catalogBrandRowsCache = self::filterExcludedListingRows($decoded);
        self::$catalogBrandRowsCacheMtime = $mtime;

        return self::$catalogBrandRowsCache;
    }

    public static function isExcludedBrandName(string $name): bool
    {
        $name = mb_strtolower(trim($name), 'UTF-8');
        if ($name === '') {
            return true;
        }

        return preg_match(
            '/cookie|политик|соглас|обработк|конфиден|пользовательск|возврат|контакт|telegram|viber|youtube|instagram|tiktok|whatsapp|mailto|tel:/iu',
            $name
        ) === 1;
    }

    /**
     * Категории каталога Vanille («Пробники», «Парфюмерная вода»), не бренды.
     */
    public static function isGarbageBrandRow(string $name, string $slug, string $sourceUrl = ''): bool
    {
        $normalizedName = mb_strtolower(trim($name), 'UTF-8');
        $normalizedSlug = mb_strtolower(trim($slug), 'UTF-8');
        $normalizedSourceUrl = mb_strtolower(trim($sourceUrl), 'UTF-8');

        if (preg_match('/\+?\d[\d\s\-\(\)]{6,}\d/u', $normalizedName) === 1) {
            return true;
        }

        if ($normalizedSlug !== '' && preg_match('/^\+?\d{6,}$/u', $normalizedSlug) === 1) {
            return true;
        }

        if (str_contains($normalizedName, '@')) {
            return true;
        }

        $keywords = [
            'telegram', 'телеграм', 'бот', 'viber', 'whatsapp', 'instagram', 'инстаграм',
            'контакт', 'доставка', 'оплата', 'обработка обращений', 'подар', 'сертификат',
            'sale', 'акции', 'отливант', 'остатки', 'атомайзер',
        ];

        $excludedNames = [
            'лимитированные издания',
            'ароматы 2024 года',
            'ароматы 2023 года',
            'духи от знаменитостей',
            'классика',
            'арабская парфюмерия',
            'топ 100 женских',
            'топ 100 мужских',
            'топ 100 унисекс',
            'парфюмерия',
            'для женщин',
            'для мужчин',
            'унисекс',
            'лидеры продаж',
            'новинки',
            'люкс/элитная',
            'селективная/нишевая',
            'свидетельство о регистрации',
            'условия возврата',
            'обработка обращений',
            'духи',
            'парфюмерная вода',
            'туалетная вода',
            'одеколоны',
            'пробники',
            'цитрусовые',
            'цветочные',
            'фужерные',
            'фруктовые',
            'свежие',
            'пряные',
            'ориентальные',
            'мускусные',
            'кожаные',
            'древесные',
            'восточные',
            'водные',
            'ванильные',
            'ароматические',
            'альдегидные',
            'швейцарские',
            'бахрейнские',
            'польские',
            'оманские',
            'английские',
            'испанские',
            'американские',
            'французские',
            'немецкие',
            'российские',
            'итальянские',
            'арабские',
            'японские',
            'свидетельство',
            'ошибка',
            'ароматы',
            'подбор',
            'условия',
            'обработка',
            'парфюмерные',
            'парфюмерная',
            'туалетная',
            'одеколоны',
            'что',
            'как',
            'топ',
        ];

        if (in_array($normalizedName, $excludedNames, true) || self::isExcludedListingSlug($normalizedSlug)) {
            return true;
        }

        foreach ($keywords as $keyword) {
            if (
                ($normalizedName !== '' && str_contains($normalizedName, $keyword))
                || ($normalizedSlug !== '' && str_contains($normalizedSlug, $keyword))
                || ($normalizedSourceUrl !== '' && str_contains($normalizedSourceUrl, $keyword))
            ) {
                return true;
            }
        }

        return false;
    }

    private const BRENDYI_URL = 'https://vanille.by/brendyi';

    /**
     * Суммирует счётчики товаров со страницы /brendyi (span.brend-count у ссылок на бренды).
     *
     * @return array{
     *     source_url: string,
     *     brands: list<array{name: string, slug: string, count: int}>,
     *     unique_brands: int,
     *     total_product_count: int,
     *     total_including_duplicate_slugs: int,
     *     duplicate_slug_entries: int,
     * }
     */
    public function parseBrendyiProductCounts(?string $html = null): array
    {
        if ($html === null) {
            $html = $this->httpClient->fetchUrl(self::BRENDYI_URL, 25);
        }

        $pattern = '/<a\s+href="(https:\/\/vanille\.by\/[^"#?]+|\/[^"#?\/][^"#?]*)"[^>]*>\s*([^<]+?)\s*<span[^>]*class="[^"]*brend-count[^"]*"[^>]*>\s*(\d+)\s*<\/span>\s*<\/a>/iu';
        preg_match_all($pattern, $html, $matches, PREG_SET_ORDER);

        $bySlug = [];
        $totalIncludingDuplicates = 0;
        $duplicateSlugEntries = 0;

        foreach ($matches as $match) {
            $href = html_entity_decode(trim($match[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $name = html_entity_decode(trim(strip_tags($match[2])), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $count = (int) $match[3];

            if ($name === '' || $count < 0) {
                continue;
            }

            $slug = $this->resolveBrandSlugFromHref($href);
            if ($slug === '' || !self::isValidBrandSlug($slug)) {
                continue;
            }

            if (self::isGarbageBrandRow($name, $slug, $href)) {
                continue;
            }

            $totalIncludingDuplicates += $count;

            if (isset($bySlug[$slug])) {
                $duplicateSlugEntries++;
                continue;
            }

            $bySlug[$slug] = [
                'name' => $name,
                'slug' => $slug,
                'count' => $count,
            ];
        }

        $brands = array_values($bySlug);
        usort($brands, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);

        return [
            'source_url' => self::BRENDYI_URL,
            'brands' => $brands,
            'unique_brands' => count($brands),
            'total_product_count' => array_sum(array_column($brands, 'count')),
            'total_including_duplicate_slugs' => $totalIncludingDuplicates,
            'duplicate_slug_entries' => $duplicateSlugEntries,
        ];
    }

    private function resolveBrandSlugFromHref(string $href): string
    {
        if (str_starts_with($href, '/poisk?') || str_contains($href, 'query=')) {
            $queryString = parse_url($href, PHP_URL_QUERY) ?? '';
            parse_str($queryString, $query);
            $slug = trim((string) ($query['query'] ?? ''));

            return mb_strtolower($slug, 'UTF-8');
        }

        $path = parse_url($href, PHP_URL_PATH) ?? '';
        $path = trim($path, '/');
        if ($path === '' || str_contains($path, '/')) {
            return '';
        }

        return mb_strtolower($path, 'UTF-8');
    }
}
