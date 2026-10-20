<?php

namespace Modules\ImportExport\Support\ElParfume;

final class ElParfumeHtmlContent
{
    public static function decode(string $value): string
    {
        if ($value === '') {
            return '';
        }

        return html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    public static function normalizeNewlines(string $value): string
    {
        if ($value === '') {
            return '';
        }

        return str_replace(["\\r\\n", "\\n", "\r\n", "\r"], "\n", $value);
    }

    public static function rewriteLinks(string $html, ElParfumeRedirectMap $map, string $fallbackTarget = '/catalog'): string
    {
        if ($html === '') {
            return '';
        }

        return (string) preg_replace_callback(
            '/\bhref\s*=\s*(["\'])(.*?)\1/is',
            static function (array $matches) use ($map, $fallbackTarget): string {
                $quote = $matches[1];
                $href = html_entity_decode(trim($matches[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $oldPath = self::hrefToOldPath($href);
                if ($oldPath === null) {
                    return $matches[0];
                }

                $target = $map->targetForOldPath($oldPath) ?? $fallbackTarget;
                $fragment = '';
                if (str_contains($href, '#')) {
                    $fragment = substr($href, (int) strpos($href, '#'));
                }

                return 'href='.$quote.$target.$fragment.$quote;
            },
            $html,
        );
    }

    public static function hrefToOldPath(string $href): ?string
    {
        $href = trim($href);
        if ($href === '' || str_starts_with($href, '#') || str_starts_with($href, 'mailto:') || str_starts_with($href, 'tel:')) {
            return null;
        }

        if (preg_match('#^https?://(www\.)?el-parfume\.by#i', $href) === 1) {
            $path = parse_url($href, PHP_URL_PATH);
            $path = is_string($path) && $path !== '' ? $path : '/';

            return self::normalizeOldPath($path);
        }

        if (preg_match('#^https?://#i', $href) === 1) {
            return null;
        }

        if (str_starts_with($href, '/image/') || str_starts_with($href, 'image/')) {
            return null;
        }

        $path = explode('#', explode('?', $href)[0], 2)[0];
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }

        return self::normalizeOldPath($path);
    }

    public static function normalizeOldPath(string $path): string
    {
        $path = rawurldecode(trim($path));
        if ($path === '') {
            return '/';
        }
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        return $path === '' ? '/' : $path;
    }

    public static function buildExcerptFromContent(string $htmlContent): string
    {
        $normalized = self::normalizeNewlines($htmlContent);
        $withBreaks = preg_replace(
            '~</\s*(p|div|h[1-6]|li|tr|blockquote)\s*>~iu',
            "\n\n",
            $normalized,
        ) ?? $normalized;
        $withBreaks = preg_replace('~<\s*br\s*/?\s*>~iu', "\n", $withBreaks) ?? $withBreaks;

        $plain = strip_tags($withBreaks);
        $plain = html_entity_decode($plain, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $plain = preg_replace('/[\x{00A0}]+/u', ' ', $plain) ?? $plain;
        $plain = preg_replace('/[ \t]+/u', ' ', $plain) ?? $plain;
        $plain = preg_replace('/\n{3,}/u', "\n\n", $plain) ?? $plain;
        $plain = trim($plain);

        if ($plain === '') {
            return '';
        }

        $paragraphs = preg_split('/\n{2,}/u', $plain) ?: [$plain];
        $first = '';
        foreach ($paragraphs as $block) {
            $block = trim((string) $block);
            if ($block !== '') {
                $first = $block;
                break;
            }
        }
        if ($first === '') {
            $first = $plain;
        }

        $first = preg_replace('/\s+/u', ' ', $first) ?? $first;
        $first = trim((string) $first);

        $maxLen = 400;
        if (mb_strlen($first, 'UTF-8') <= $maxLen) {
            return $first;
        }

        $chunk = mb_substr($first, 0, $maxLen, 'UTF-8');
        $lastSpace = mb_strrpos($chunk, ' ', 0, 'UTF-8');
        if ($lastSpace !== false && $lastSpace > (int) ($maxLen * 0.55)) {
            $chunk = mb_substr($chunk, 0, $lastSpace, 'UTF-8');
        }

        return rtrim($chunk).'…';
    }

    /**
     * @param  array<string, true>  $remoteImages
     */
    public static function collectRemoteImageUrls(string $html, array &$remoteImages): void
    {
        if ($html === '') {
            return;
        }

        if (preg_match_all('/\bsrc\s*=\s*(["\'])(.*?)\1/is', $html, $matches) !== false) {
            foreach ($matches[2] as $src) {
                $src = html_entity_decode(trim((string) $src), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                if ($src === '') {
                    continue;
                }
                if (preg_match('#^https?://(www\.)?el-parfume\.by/image/#i', $src) === 1) {
                    $remoteImages[$src] = true;
                }
            }
        }
    }
}
