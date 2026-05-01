<?php

namespace Modules\Catalog\Support;

use Illuminate\Support\Str;

/**
 * Единая нормализация имени товара для:
 *  — матчинга прайса Seller One → каталог;
 *  — админского поиска «найти товар для связи» (AND по токенам, без ложных LIKE).
 *
 * Маркеры пола не выкидываем: иначе «… for Women» матчится с линией без пола в названии.
 * Синонимы (for women / pour femme) сводим к каноническим токенам __linkgf__ / __linkgm__ / __linkgu__.
 */
final class CatalogProductLinkNameTokenizer
{
    public const string TOKEN_GF = '__linkgf__';

    public const string TOKEN_GM = '__linkgm__';

    public const string TOKEN_GU = '__linkgu__';

    /**
     * Токены для алгоритма SellerOneVariantMatcher (после снятия бренда с имени каталога / строки поставщика).
     *
     * @return list<string>
     */
    public static function variantMatchTokens(string $name, ?string $brandName): array
    {
        $normalized = self::normalizeText($name);
        if ($normalized === '') {
            return [];
        }

        if ($brandName !== null && $brandName !== '') {
            $brandNorm = self::normalizeText($brandName);
            if ($brandNorm !== '') {
                if ($normalized === $brandNorm) {
                    return [];
                }
                if (Str::startsWith($normalized, $brandNorm.' ')) {
                    $normalized = trim((string) mb_substr($normalized, mb_strlen($brandNorm)));
                }
            }
        }

        $normalized = self::applyGenderCanonicalTokens($normalized);
        $normalized = (string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', ' ', $normalized);
        $normalized = (string) preg_replace('/\b(edp|edt|edc|parfum|extrait)\b/iu', ' ', $normalized);
        $normalized = (string) preg_replace('/\b(test|tester|тестер|vial|sample|пробник)\b/iu', ' ', $normalized);
        $normalized = preg_replace('/\s+/u', ' ', trim($normalized)) ?: '';

        if ($normalized === '') {
            return [];
        }

        $parts = preg_split('/\s+/u', $normalized) ?: [];

        return array_values(array_filter($parts, static fn (string $t): bool => mb_strlen($t) >= 2));
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
            if (Str::startsWith($normalizedTitle, $normalizedBrand) && Str::length($normalizedBrand) > $bestLen) {
                $bestId = (int) $brand->id;
                $bestName = $name;
                $bestLen = Str::length($normalizedBrand);
            }
        }

        if ($bestName === null || $bestName === '') {
            return ['brand_id' => null, 'brand_name' => null, 'rest' => trim($title)];
        }

        $pattern = '/^'.preg_quote($bestName, '/').'\s+/iu';
        $rest = trim((string) preg_replace($pattern, '', $title, 1));

        return ['brand_id' => $bestId, 'brand_name' => $bestName, 'rest' => $rest !== '' ? $rest : trim($title)];
    }

    /**
     * Значимые токены для AND-поиска в БД (без канонических маркеров пола в LIKE — их раскрывает сервис поиска).
     *
     * @return list<string>
     */
    public static function linkSearchTokensFromRest(string $rest, ?string $brandName): array
    {
        return self::variantMatchTokens($rest, $brandName);
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

    public static function normalizeText(string $value): string
    {
        $value = Str::lower($value);
        $value = preg_replace('/[^[:alnum:]\s]+/u', ' ', $value) ?: '';
        $value = preg_replace('/\s+/u', ' ', trim($value)) ?: '';

        return $value;
    }

    private static function applyGenderCanonicalTokens(string $normalized): string
    {
        $s = $normalized;
        $replacements = [
            '/\bfor\s+women\b/iu' => ' '.self::TOKEN_GF.' ',
            '/\bfor\s+woman\b/iu' => ' '.self::TOKEN_GF.' ',
            '/\bpour\s+femme\b/iu' => ' '.self::TOKEN_GF.' ',
            '/\bfor\s+her\b/iu' => ' '.self::TOKEN_GF.' ',
            '/\bfor\s+men\b/iu' => ' '.self::TOKEN_GM.' ',
            '/\bfor\s+man\b/iu' => ' '.self::TOKEN_GM.' ',
            '/\bpour\s+homme\b/iu' => ' '.self::TOKEN_GM.' ',
            '/\bfor\s+him\b/iu' => ' '.self::TOKEN_GM.' ',
            '/\bunisex\b/iu' => ' '.self::TOKEN_GU.' ',
        ];
        foreach ($replacements as $pattern => $replacement) {
            $s = (string) preg_replace($pattern, $replacement, $s);
        }

        return preg_replace('/\s+/u', ' ', trim($s)) ?: '';
    }
}
