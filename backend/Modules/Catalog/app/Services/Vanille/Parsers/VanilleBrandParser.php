<?php

namespace Modules\Catalog\Services\Vanille\Parsers;

use Modules\Catalog\Services\Vanille\Support\VanilleHttpClient;

class VanilleBrandParser
{
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

            if (in_array($slug, [
                'brendyi',
                'catalog',
                'shop',
                'sale',
                'skidki',
                'dostavka',
                'oplata',
                'o-magazine',
                'otzyivyi-o-magazine',
                'akczii-i-novosti',
            ], true)) {
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
