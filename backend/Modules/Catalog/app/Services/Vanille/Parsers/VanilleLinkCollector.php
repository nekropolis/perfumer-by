<?php

namespace Modules\Catalog\Services\Vanille\Parsers;

use Modules\Catalog\Services\Vanille\Support\VanilleHttpClient;

class VanilleLinkCollector
{
    public function __construct(
        protected VanilleHttpClient $httpClient,
    ) {
    }

    public function collect(array $brands, int $offset = 0, int $limit = 100, ?int $maxLinks = 100): array
    {
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

            if (in_array($brandSlug, [
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

            try {
                $html = $this->httpClient->fetchUrl($url, 10);
            } catch (\Throwable $e) {
                $log[] = "skip brand: {$brandName} -> " . $e->getMessage();
                continue;
            }

            preg_match_all('/href="([^"]+)"/isu', $html, $matches);

            $found = 0;

            foreach ($matches[1] as $href) {
                $href = html_entity_decode(trim($href), ENT_QUOTES | ENT_HTML5, 'UTF-8');

                if ($href === '' || str_starts_with($href, '#')) {
                    continue;
                }

                $href = preg_replace('/#.*$/', '', $href);

                if ($href === '') {
                    continue;
                }

                $fullUrl = str_starts_with($href, 'http://') || str_starts_with($href, 'https://')
                    ? $href
                    : 'https://vanille.by' . (str_starts_with($href, '/') ? $href : '/' . $href);

                $parsedPath = parse_url($fullUrl, PHP_URL_PATH) ?? '';
                $slug = trim($parsedPath, '/');

                if ($slug === '' || str_contains($slug, '/')) {
                    continue;
                }
                if (in_array($slug, [
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
                ], true)) {
                    continue;
                }

                if ($slug === $brandSlug) {
                    continue;
                }

                if ($brandSlug !== '' && !str_starts_with($slug, $brandSlug . '-')) {
                    continue;
                }

                $indexed[$slug] = [
                    'slug' => $slug,
                    'url' => 'https://vanille.by/' . $slug,
                    'brand' => $brandName,
                ];

                $found++;

                if ($maxLinks !== null && count($indexed) >= $maxLinks) {
                    $reachedMaxLinks = true;
                    break;
                }
            }

            $log[] = "{$brandName}: {$found}";

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
}
