<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

/**
 * Извлекает URL превью товаров со страницы бренда Vanille (листинг без watermark).
 */
class VanilleCatalogImageParser
{
    /**
     * По разметке пагинации Vanille (?page=N) возвращает максимальный номер страницы; минимум 1.
     */
    public function maxListingPageFromHtml(string $html): int
    {
        $max = 1;
        if (preg_match_all('/[?&]page=(\d+)/iu', $html, $matches)) {
            foreach ($matches[1] as $raw) {
                $n = (int) $raw;
                if ($n > $max) {
                    $max = $n;
                }
            }
        }

        return $max;
    }

    /**
     * @param  bool  $requireBrandSlugPrefix  На странице листинга бренда slug товара часто не совпадает с slug бренда (dolce-and-gabbana-* vs dolce-i-gabbana).
     * @return list<array{slug:string, image_url:string, image_urls:list<string>}>
     */
    public function parseListing(string $html, ?string $brandSlug = null, bool $requireBrandSlugPrefix = false): array
    {
        $out = [];
        $seenSlug = [];

        if (preg_match_all(
            '/<div[^>]+class="[^"]*\bproduct-cut\b[^"]*"[^>]*>(.*?)<\/div>\s*<\/div>/isu',
            $html,
            $blocks
        )) {
            foreach ($blocks[1] as $block) {
                $this->appendListingRowsFromFragment(
                    $block,
                    $brandSlug,
                    false,
                    $seenSlug,
                    $out,
                );
            }
        }

        if ($out === []) {
            $this->appendListingRowsFromFragment(
                $html,
                $brandSlug,
                $requireBrandSlugPrefix,
                $seenSlug,
                $out,
            );
        }

        return $out;
    }

    /**
     * Каталожные превью (medium/mediumwebp) с карточки товара — fallback, если товара нет в листинге бренда.
     *
     * @return list<string>
     */
    public function parseProductPageCatalogImageUrls(string $html): array
    {
        if (! preg_match('/<div[^>]+class="[^"]*product-photo[^"]*"[^>]*>(.*?)<\/div>\s*<div/isu', $html, $photoScope)) {
            return [];
        }

        return $this->findCatalogListingUrlsInHtml($photoScope[1]);
    }

    /**
     * @param  array<string, true>  $seenSlug
     * @param  list<array{slug:string, image_url:string, image_urls:list<string>}>  $out
     */
    private function appendListingRowsFromFragment(
        string $fragment,
        ?string $brandSlug,
        bool $requireBrandSlugPrefix,
        array &$seenSlug,
        array &$out,
    ): void {
        $brandSlugNorm = $brandSlug !== null && $brandSlug !== '' ? mb_strtolower(trim($brandSlug)) : '';

        if (! preg_match_all(
            '/<a[^>]+href="(?:https?:\/\/vanille\.by)?\/([^"#?]+)"[^>]*>(.*?)<\/a>/isu',
            $fragment,
            $matches,
            PREG_SET_ORDER
        )) {
            return;
        }

        foreach ($matches as $m) {
            $slug = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'), '/');
            $inner = $m[2] ?? '';
            if ($slug === '' || str_contains($slug, '/')) {
                continue;
            }
            if ($requireBrandSlugPrefix && $brandSlugNorm !== '') {
                $slugLower = mb_strtolower($slug);
                if (
                    ! str_starts_with($slugLower, $brandSlugNorm.'-')
                    && ! str_contains($slugLower, '-'.$brandSlugNorm.'-')
                    && ! str_ends_with($slugLower, '-'.$brandSlugNorm)
                ) {
                    continue;
                }
            }
            if (isset($seenSlug[$slug])) {
                continue;
            }

            $imageUrls = $this->findImageUrlsInHtml($inner);
            if ($imageUrls === []) {
                continue;
            }

            $seenSlug[$slug] = true;
            $out[] = [
                'slug' => $slug,
                'image_url' => $imageUrls[0],
                'image_urls' => $imageUrls,
            ];
        }
    }

    /**
     * Vanille кладёт hover-картинку (product-photo__img__second) в DOM раньше основной.
     * Для импорта нужен порядок: сначала главное фото листинга, затем hover.
     *
     * @return list<string>
     */
    private function findImageUrlsInHtml(string $fragment): array
    {
        $primary = [];
        $secondary = [];
        $seen = [];

        if (! preg_match_all('/<img([^>]+)>/iu', $fragment, $matches)) {
            return [];
        }

        foreach ($matches[1] as $attrs) {
            if (! preg_match('/(?:data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/iu', $attrs, $urlMatch)) {
                continue;
            }

            $url = $this->normalizeUrl((string) $urlMatch[1]);
            if ($url === '' || isset($seen[$url])) {
                continue;
            }
            $seen[$url] = true;

            if (str_contains($attrs, 'img__second') || str_contains($attrs, '__second')) {
                $secondary[] = $url;
            } else {
                $primary[] = $url;
            }

            if (count($primary) + count($secondary) >= 2) {
                break;
            }
        }

        return array_slice(array_merge($primary, $secondary), 0, 2);
    }

    /**
     * Только medium/mediumwebp (как на листинге), без large/largewebp с карточки.
     *
     * @return list<string>
     */
    private function findCatalogListingUrlsInHtml(string $fragment): array
    {
        $primary = [];
        $secondary = [];
        $seen = [];

        if (! preg_match_all('/<img([^>]+)>/iu', $fragment, $matches)) {
            return [];
        }

        foreach ($matches[1] as $attrs) {
            if (! preg_match('/(?:data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/iu', $attrs, $urlMatch)) {
                continue;
            }

            $url = $this->normalizeUrl((string) $urlMatch[1]);
            if ($url === '' || isset($seen[$url])) {
                continue;
            }
            if (! preg_match('#/assets/images/products/\d+/(medium|mediumwebp)/#i', $url)) {
                continue;
            }

            $seen[$url] = true;

            if (str_contains($attrs, 'img__second') || str_contains($attrs, '__second')) {
                $secondary[] = $url;
            } else {
                $primary[] = $url;
            }
        }

        $merged = array_merge($primary, $secondary);
        if ($merged === []) {
            return [];
        }

        $out = [];
        foreach ($merged as $url) {
            if (isset($out[$url])) {
                continue;
            }
            $out[$url] = true;
            if (count($out) >= 2) {
                break;
            }
        }

        return array_keys($out);
    }

    private function normalizeUrl(string $url): string
    {
        $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($url === '' || str_contains($url, 'data:image')) {
            return '';
        }
        if (str_starts_with($url, '//')) {
            return 'https:'.$url;
        }
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }
        if (str_starts_with($url, '/')) {
            return 'https://vanille.by'.$url;
        }

        return 'https://vanille.by/'.$url;
    }
}
