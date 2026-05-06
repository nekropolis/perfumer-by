<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

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
            'dostavka',
            'francziya',
            'germaniya',
            'ispaniya',
            'italiya',
            'izbrannyie',
            'kozhanyie',
            'lk',
            'o-magazine',
            'oformlenie',
            'oplata',
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
}
