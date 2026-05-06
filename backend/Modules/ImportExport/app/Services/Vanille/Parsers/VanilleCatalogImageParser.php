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
     * @return list<array{slug:string, image_url:string}>
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

                $imageUrl = $this->findFirstImageUrlInHtml($inner);
                if ($imageUrl === '') {
                    continue;
                }

                $seenSlug[$slug] = true;
                $out[] = [
                    'slug' => $slug,
                    'image_url' => $imageUrl,
                ];
            }
        }

        return $out;
    }

    private function findFirstImageUrlInHtml(string $fragment): string
    {
        if (preg_match('/<img[^>]+(?:data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/iu', $fragment, $im)) {
            return $this->normalizeUrl($im[1]);
        }

        return '';
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
