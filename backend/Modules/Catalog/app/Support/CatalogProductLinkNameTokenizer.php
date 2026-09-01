<?php

namespace Modules\Catalog\Support;

use Illuminate\Support\Str;

/**
 * Единая нормализация имени товара для:
 *  — матчинга прайса Seller One → каталог;
 *  — админского поиска «найти товар для связи» (AND по токенам, без ложных LIKE).
 *
 * Маркеры пола не выкидываем: иначе «… for Women» матчится с линией без пола в названии.
 * Синонимы пола (for women / for man / for him) — к __linkgf__ / __linkgm__ / __linkgu__.
 */
final class CatalogProductLinkNameTokenizer
{
    public const string TOKEN_GF = '__linkgf__';

    public const string TOKEN_GM = '__linkgm__';

    public const string TOKEN_GU = '__linkgu__';

    public const string TOKEN_LINE_SG = 'linesg';

    public const string TOKEN_LINE_BL = 'linebl';

    public const string TOKEN_LINE_LA = 'linela';

    /**
     * Токены для алгоритма SellerOneVariantMatcher (после снятия бренда с имени каталога / строки поставщика).
     *
     * @return list<string>
     */
    public static function variantMatchTokens(
        string $name,
        ?string $brandName,
        bool $applyLineSuffixTokens = true,
        bool $applyStandaloneGenderTokens = false,
    ): array {
        $normalized = self::normalizeText($name);
        if ($normalized === '') {
            return [];
        }

        if ($brandName !== null && $brandName !== '') {
            $brandNorm = self::normalizeText($brandName);
            if ($brandNorm !== '') {
                if ($normalized !== $brandNorm && Str::startsWith($normalized, $brandNorm.' ')) {
                    $remainder = trim((string) mb_substr($normalized, mb_strlen($brandNorm)));
                    if ($remainder !== '' && self::textIsOnlyGenderMarker($remainder, $applyStandaloneGenderTokens)) {
                        $normalized = $brandNorm.' '.$remainder;
                    } else {
                        $normalized = $remainder;
                    }
                }
            }
        }

        $normalized = self::applyGenderCanonicalTokens($normalized, $applyStandaloneGenderTokens);
        $normalized = (string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', ' ', $normalized);
        if ($applyLineSuffixTokens) {
            $normalized = self::applyLeadingLineNumberToken($normalized);
            $normalized = self::applyTrailingLineSuffixToken($normalized);
            $normalized = self::applyInlineLineLetterTokens($normalized);
        }
        // «Parfum» в прайсе (Pasha Parfum) = линия «… de Parfum» в каталоге — оставляем токен «de».
        $normalized = (string) preg_replace('/\bde\s+parfum\b/iu', ' de ', $normalized);
        $normalized = (string) preg_replace('/\bparfum\b/iu', ' de ', $normalized);
        $normalized = (string) preg_replace('/\bextrait\s+de\s+parfum\b/iu', ' ', $normalized);
        $normalized = (string) preg_replace('/\b(edp|edt|edc)\b/iu', ' ', $normalized);
        $normalized = (string) preg_replace('/\b(test|tester|тестер|vial)\b/iu', ' ', $normalized);
        $normalized = preg_replace('/\s+/u', ' ', trim($normalized)) ?: '';

        if ($normalized === '') {
            return [];
        }

        $parts = preg_split('/\s+/u', $normalized) ?: [];

        return array_values(array_filter($parts, static fn (string $t): bool => self::isVariantMatchToken($t)));
    }

    /** Токены ≥2 символа; однобуквенные слова линии («Q Intense», «A Corps Secret») — сохраняем. */
    private static function isVariantMatchToken(string $token): bool
    {
        if (mb_strlen($token) >= 2) {
            return true;
        }

        if (mb_strlen($token) === 1 && preg_match('/^\d$/', $token)) {
            return true;
        }

        if (mb_strlen($token) !== 1 || ! preg_match('/^\p{L}$/u', $token)) {
            return false;
        }

        return ! in_array($token, ['m', 'l', 'u', 'w'], true);
    }

    /**
     * «8 Sweet Reveal» — номер линии в начале имени, не объём.
     */
    private static function applyLeadingLineNumberToken(string $normalized): string
    {
        $trimmed = trim($normalized);
        if ($trimmed === '' || ! preg_match('/^(\d+)\s+/u', $trimmed, $matches)) {
            return $trimmed;
        }

        $digits = (string) $matches[1];
        $lineNumber = ltrim($digits, '0') !== '' ? ltrim($digits, '0') : '0';

        return trim((string) preg_replace(
            '/^'.preg_quote($digits, '/').'\s+/u',
            ' line'.$lineNumber.' ',
            $trimmed,
        ));
    }

    /**
     * Разбор полной строки (как в прайсе / поле поиска): снять бренд по самому длинному префиксу из списка.
     *
     * @param  iterable<object{id:int,name:string}>  $brands
     * @return array{brand_id: ?int, brand_name: ?string, rest: string}
     */
    public static function splitLeadingBrand(string $title, iterable $brands): array
    {
        $normalizedTitle = self::normalizeText($title);
        $bestId = null;
        $bestName = null;
        $bestLen = 0;

        foreach ($brands as $brand) {
            $name = trim((string) ($brand->name ?? ''));
            if ($name === '') {
                continue;
            }
            $normalizedBrand = self::normalizeText($name);
            if ($normalizedBrand === '') {
                continue;
            }
            $brandLen = Str::length($normalizedBrand);
            if ($brandLen <= $bestLen || ! Str::startsWith($normalizedTitle, $normalizedBrand)) {
                continue;
            }
            // Граница слова: «Si» не должен матчить «Signature Absolue».
            $after = mb_substr($normalizedTitle, $brandLen, null, 'UTF-8');
            if ($after !== '' && ! str_starts_with($after, ' ')) {
                continue;
            }
            $bestId = (int) $brand->id;
            $bestName = $name;
            $bestLen = $brandLen;
        }

        if ($bestName === null || $bestName === '') {
            return ['brand_id' => null, 'brand_name' => null, 'rest' => trim($title)];
        }

        $rest = trim($title);
        $brandStripVariants = array_values(array_unique(array_filter([
            $bestName,
            preg_replace('/\s*&\s*/u', '&', $bestName) ?: $bestName,
            preg_replace('/\s*&\s*/u', ' & ', $bestName) ?: $bestName,
            preg_replace('/\s+/u', '', $bestName) ?: $bestName,
        ], static fn (string $v): bool => $v !== '')));

        foreach ($brandStripVariants as $variant) {
            $pattern = '/^'.preg_quote($variant, '/').'\s+/iu';
            if (preg_match($pattern, $title) === 1) {
                $stripped = trim((string) preg_replace($pattern, '', $title, 1));
                if ($stripped !== '') {
                    $rest = $stripped;
                }
                break;
            }
        }

        // Normalized fallback: brand matched via normalizeText but raw spelling differs (Dolce&Gabbana vs Dolce & Gabbana).
        if ($rest === trim($title) && Str::startsWith($normalizedTitle, self::normalizeText($bestName).' ')) {
            $rest = trim((string) mb_substr($normalizedTitle, mb_strlen(self::normalizeText($bestName))));
        }

        return ['brand_id' => $bestId, 'brand_name' => $bestName, 'rest' => $rest !== '' ? $rest : trim($title)];
    }

    /**
     * Значимые токены для AND-поиска в БД (без канонических маркеров пола в LIKE — их раскрывает сервис поиска).
     *
     * @return list<string>
     */
    public static function linkSearchTokensFromRest(string $rest, ?string $brandName): array
    {
        // Для поиска не превращаем «Honour 43» / «Moon 1947» в line-токены — это часть имени, не суффикс линии.
        return self::variantMatchTokens($rest, $brandName, applyLineSuffixTokens: false);
    }

    public static function isProductLineMarkerToken(string $token): bool
    {
        return in_array($token, [self::TOKEN_LINE_SG, self::TOKEN_LINE_BL, self::TOKEN_LINE_LA], true)
            || (bool) preg_match('/^line[a-z0-9]+$/', $token);
    }

    public static function isGenderCanonToken(string $token): bool
    {
        return $token === self::TOKEN_GF || $token === self::TOKEN_GM || $token === self::TOKEN_GU;
    }

    /**
     * @param  list<string>  $tokens
     */
    public static function tokensContainGenderCanon(array $tokens): bool
    {
        foreach ($tokens as $t) {
            if (self::isGenderCanonToken((string) $t)) {
                return true;
            }
        }

        return false;
    }

    private static function textIsOnlyGenderMarker(string $text, bool $applyStandaloneGenderTokens = false): bool
    {
        $normalized = self::normalizeText($text);
        if ($normalized === '') {
            return false;
        }

        $withGender = self::applyGenderCanonicalTokens($normalized, $applyStandaloneGenderTokens);
        $withGender = preg_replace('/\s+/u', ' ', trim($withGender)) ?: '';
        if ($withGender === '') {
            return false;
        }

        $parts = preg_split('/\s+/u', $withGender) ?: [];
        if ($parts === []) {
            return false;
        }

        foreach ($parts as $part) {
            if (! self::isGenderCanonToken((string) $part)) {
                return false;
            }
        }

        return true;
    }

    public static function normalizeText(string $value): string
    {
        $value = Str::lower($value);
        $value = self::canonicalizeProductLineAbbreviations($value);
        $value = self::canonicalizeDottedInitialismAbbreviations($value);
        // Сохраняем дефис внутри слов (T-mat), убираем остальную пунктуацию.
        $value = preg_replace('/[^[:alnum:]\s-]+/u', ' ', $value) ?: '';
        $value = preg_replace('/(?<![[:alnum:]])-(?![[:alnum:]])/u', ' ', $value) ?: '';
        $value = preg_replace('/\s+/u', ' ', trim($value)) ?: '';

        return $value;
    }

    private static function canonicalizeDottedInitialismAbbreviations(string $value): string
    {
        return (string) preg_replace_callback(
            '/\b([a-z])\s*\.\s*([a-z])\s*\.?\b/iu',
            static function (array $matches): string {
                if ($matches[1] === 'l' && $matches[2] === 'e') {
                    return ' ';
                }

                return ' line'.$matches[1].$matches[2].' ';
            },
            $value,
        );
    }

    private static function canonicalizeProductLineAbbreviations(string $value): string
    {
        $value = (string) preg_replace('/\bs\s*\/\s*g\b/iu', ' '.self::TOKEN_LINE_SG.' ', $value);
        $value = (string) preg_replace('/\bb\s*\/\s*l\b/iu', ' '.self::TOKEN_LINE_BL.' ', $value);

        return $value;
    }

    private static function applyTrailingLineSuffixToken(string $normalized): string
    {
        $trimmed = trim($normalized);
        if ($trimmed === '') {
            return $trimmed;
        }

        if (
            ! preg_match('/\b\d+\s*\/\s*\d+\s*$/u', $trimmed)
            && ! preg_match('/\b\d+\.\d+\s*$/u', $trimmed)
            && preg_match('/\b(\d+)\s*$/u', $trimmed, $matches)
        ) {
            $digits = (string) $matches[1];
            $lineNumber = ltrim($digits, '0') !== '' ? ltrim($digits, '0') : '0';

            return trim((string) preg_replace(
                '/\b'.preg_quote($digits, '/').'\s*$/u',
                ' line'.$lineNumber.' ',
                $trimmed,
            ));
        }

        if (
            preg_match('/\b([a-z])\s*$/u', $trimmed, $matches)
            && ! preg_match('/\b[a-z]\s+[a-z]\s*$/u', $trimmed)
        ) {
            $letter = (string) $matches[1];

            return trim((string) preg_replace(
                '/\b'.preg_quote($letter, '/').'\s*$/u',
                ' line'.$letter.' ',
                $trimmed,
            ));
        }

        return $trimmed;
    }

    /**
     * Отдельная «X» в середине линии (Nishane X Hacivat) — не терять при фильтре len>=2.
     */
    private static function applyInlineLineLetterTokens(string $normalized): string
    {
        return (string) preg_replace(
            '/(?<=^|\s)x(?=\s)/u',
            ' linex ',
            trim($normalized),
        );
    }

    private static function applyGenderCanonicalTokens(string $normalized, bool $applyStandaloneGenderTokens = false): string
    {
        $s = $normalized;
        $replacements = [
            '/\bfor\s+women\b/iu' => ' '.self::TOKEN_GF.' ',
            '/\bfor\s+woman\b/iu' => ' '.self::TOKEN_GF.' ',
            '/\bfor\s+her\b/iu' => ' '.self::TOKEN_GF.' ',
            '/\bfor\s+men\b/iu' => ' '.self::TOKEN_GM.' ',
            '/\bfor\s+man\b/iu' => ' '.self::TOKEN_GM.' ',
            '/\bfor\s+him\b/iu' => ' '.self::TOKEN_GM.' ',
            '/\bunisex\b/iu' => ' '.self::TOKEN_GU.' ',
        ];
        if ($applyStandaloneGenderTokens) {
            $replacements = array_merge($replacements, [
                '/\bwomen\b/iu' => ' '.self::TOKEN_GF.' ',
                '/\bwoman\b/iu' => ' '.self::TOKEN_GF.' ',
                '/\bher\b/iu' => ' '.self::TOKEN_GF.' ',
                '/\bmen\b/iu' => ' '.self::TOKEN_GM.' ',
                '/\bman\b/iu' => ' '.self::TOKEN_GM.' ',
                '/\bhim\b/iu' => ' '.self::TOKEN_GM.' ',
            ]);
        }
        foreach ($replacements as $pattern => $replacement) {
            $s = (string) preg_replace($pattern, $replacement, $s);
        }

        return preg_replace('/\s+/u', ' ', trim($s)) ?: '';
    }
}
