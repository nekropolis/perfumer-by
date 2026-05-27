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
     * @return list<array{slug:string, image_url:string, image_urls:list<string>}>
     */
    public function parseListing(string $html, ?string $brandSlug = null): array
    {
        $out = [];
        $seenSlug = [];

        $brandSlugNorm = $brandSlug !== null && $brandSlug !== '' ? mb_strtolower(trim($brandSlug)) : '';

        if (preg_match_all(
            '/<a[^>]+href="(?:https?:\/\/vanille\.by)?\/([^"#?]+)"[^>]*>(.*?)<\/a>/isu',
            $html,
            $matches,
            PREG_SET_ORDER
        )) {
            foreach ($matches as $m) {
                $slug = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'), '/');
                $inner = $m[2] ?? '';
                if ($slug === '' || str_contains($slug, '/')) {
                    continue;
                }
                if ($brandSlugNorm !== '') {
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

        return $out;
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
