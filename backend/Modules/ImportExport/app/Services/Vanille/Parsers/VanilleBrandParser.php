<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;

class VanilleBrandParser
{
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
    public static function findCatalogBrandRow(string $brandName): ?array
    {
        $needle = mb_strtolower(trim($brandName), 'UTF-8');
        if ($needle === '') {
            return null;
        }

        foreach (self::loadCatalogBrandRows() as $row) {
            $name = mb_strtolower(trim((string) ($row['name'] ?? '')), 'UTF-8');
            if ($name === $needle || ProductDisplayName::brandNamesEquivalent($brandName, (string) ($row['name'] ?? ''))) {
                return $row;
            }
        }

        return null;
    }

    public static function isAllowedImportBrand(string $brandName): bool
    {
        if (trim($brandName) === '') {
            return false;
        }

        return self::findCatalogBrandRow($brandName) !== null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function loadCatalogBrandRows(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $path = storage_path('app/public/imports/vanille/brands.json');
        if (!is_file($path)) {
            $cache = [];

            return $cache;
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        $cache = is_array($decoded) ? self::filterExcludedListingRows($decoded) : [];

        return $cache;
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
}
