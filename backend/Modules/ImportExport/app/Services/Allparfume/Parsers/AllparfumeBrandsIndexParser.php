<?php

namespace Modules\ImportExport\Services\Allparfume\Parsers;

final class AllparfumeBrandsIndexParser
{
    /**
     * Non-brand single-segment pages on allparfume.by.
     *
     * @var list<string>
     */
    private const SKIP_SLUGS = [
        'brands',
        'otlivant',
        'new',
        'hot',
        'shops',
        'female',
        'male',
        'novinki',
        'popular',
        'delivery',
        'payment',
        'contacts',
        'about',
        'cart',
        'wishlist',
        'compare',
        'search',
        'login',
        'register',
        'adv',
        'index',
        'info',
        'news',
        'blog',
        'faq',
        'help',
    ];

    /**
     * @return list<array{brand_slug:string,brand_name:string,brand_url:string}>
     */
    public function parseBrandsIndex(string $html, string $baseUrl = 'https://allparfume.by'): array
    {
        $baseUrl = rtrim($baseUrl, '/');
        $bySlug = [];

        if (! preg_match_all(
            '/<a[^>]+href=["\'](\/[a-z0-9_.]+\.html)["\'][^>]*>(.*?)<\/a>/is',
            $html,
            $matches,
            PREG_SET_ORDER,
        )) {
            return [];
        }

        foreach ($matches as $match) {
            $href = (string) ($match[1] ?? '');
            $rawName = html_entity_decode(strip_tags((string) ($match[2] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $name = trim(preg_replace('/\s+/u', ' ', $rawName) ?? '');
            if ($name === '' || mb_strlen($name) < 2) {
                continue;
            }
            // Only top-level /file.html (brand pages), not /brand/product.html
            if (substr_count($href, '/') !== 1) {
                continue;
            }

            $file = ltrim($href, '/');
            if (! str_ends_with(mb_strtolower($file), '.html')) {
                continue;
            }
            $slug = mb_strtolower(substr($file, 0, -5)); // strip .html
            $slug = rtrim($slug, '.');
            if ($slug === '' || in_array($slug, self::SKIP_SLUGS, true)) {
                continue;
            }
            if (! preg_match('/^[a-z0-9_]+$/', $slug)) {
                continue;
            }

            $bySlug[$slug] = [
                'brand_slug' => $slug,
                'brand_name' => $name,
                'brand_url' => $baseUrl.'/'.$file,
            ];
        }

        ksort($bySlug);

        return array_values($bySlug);
    }
}
