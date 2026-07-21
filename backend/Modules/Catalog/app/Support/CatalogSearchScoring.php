<?php

namespace Modules\Catalog\Support;

/**
 * Shared text normalization and scoring for catalog search.
 * Used by both ProductController (storefront smartSearch) and CatalogProductLinkSearchService (admin link search).
 */
class CatalogSearchScoring
{
    const float SCORE_SIMILARITY_CONTAINS = 0.96;
    const float SCORE_PHRASE_FACTOR = 0.9;

    public static function normalizeSearchText(string $value): string
    {
        $value = mb_strtolower($value, 'UTF-8');
        $value = preg_replace('/[^[:alnum:]\s]+/u', ' ', $value) ?? '';
        $value = preg_replace('/\s+/u', ' ', $value) ?? '';

        return trim($value);
    }

    /**
     * Сравнимая строка «бренд + продукт» без дубля бренда в name (Ormonde Jayne + Ormonde Jayne Ormond).
     */
    public static function buildProductSearchLabel(string $brandName, string $productName): string
    {
        $brandName = trim($brandName);
        $productName = trim($productName);

        if ($productName === '') {
            return self::normalizeSearchText($brandName);
        }
        if ($brandName === '') {
            return self::normalizeSearchText($productName);
        }

        $normalizedBrand = self::normalizeSearchText($brandName);
        $normalizedName = self::normalizeSearchText($productName);

        if ($normalizedName === $normalizedBrand) {
            return $normalizedBrand;
        }
        if ($normalizedBrand !== '' && str_starts_with($normalizedName, $normalizedBrand.' ')) {
            return $normalizedName;
        }

        return self::normalizeSearchText($brandName.' '.$productName);
    }

    /**
     * @return list<string>
     */
    public static function splitWords(string $value): array
    {
        return array_values(array_filter(explode(' ', $value)));
    }

    public static function similarityScore(string $needle, string $haystack): float
    {
        if ($needle === '' || $haystack === '') {
            return 0.0;
        }
        if ($needle === $haystack) {
            return 1.0;
        }

        $needleLen = mb_strlen($needle, 'UTF-8');
        $haystackLen = max(1, mb_strlen($haystack, 'UTF-8'));
        $coverageRatio = $needleLen / $haystackLen;

        if (str_starts_with($haystack, $needle)) {
            $tail = mb_substr($haystack, $needleLen, null, 'UTF-8');
            if ($tail === '' || preg_match('/^\s/u', $tail) === 1) {
                return 0.97 * $coverageRatio + 0.03;
            }
        }

        if (str_contains($haystack, $needle)) {
            return self::SCORE_SIMILARITY_CONTAINS * $coverageRatio;
        }

        $needleTokens = self::splitWords($needle);
        $haystackTokens = self::splitWords($haystack);

        $tokenScoreSum = 0.0;
        foreach ($needleTokens as $needleToken) {
            $bestTokenScore = self::diceCoefficient($needleToken, $haystack);
            foreach ($haystackTokens as $haystackToken) {
                $bestTokenScore = max($bestTokenScore, self::diceCoefficient($needleToken, $haystackToken));
            }
            $tokenScoreSum += $bestTokenScore;
        }

        $avgTokenScore = $tokenScoreSum / max(1, count($needleTokens));
        $phraseScore = self::diceCoefficient($needle, $haystack);

        return max($avgTokenScore, $phraseScore * self::SCORE_PHRASE_FACTOR);
    }

    /**
     * Ранг для сортировки выдачи: exact > расширение (Ormond Elixir) > contains > fuzzy.
     *
     * @return array{tier: int, score: float, full: string, full_len: int}
     */
    public static function productSearchRank(string $query, string $brandName, string $productName): array
    {
        $normalizedQuery = self::normalizeSearchText($query);
        $normalizedName = self::normalizeSearchText($productName);
        $full = self::buildProductSearchLabel($brandName, $productName);
        $score = self::similarityScore($normalizedQuery, $full);
        $fullLen = mb_strlen($full, 'UTF-8');

        if ($normalizedQuery === '' || $full === '') {
            return ['tier' => 3, 'score' => 0.0, 'full' => $full, 'full_len' => $fullLen];
        }

        // Точное совпадение названия товара («the one» → «The One») выше, чем brand+name.
        if ($normalizedName === $normalizedQuery || $full === $normalizedQuery) {
            return ['tier' => 0, 'score' => max($score, 1.0), 'full' => $full, 'full_len' => $fullLen];
        }

        if (str_starts_with($normalizedName, $normalizedQuery)) {
            $nameTail = mb_substr($normalizedName, mb_strlen($normalizedQuery, 'UTF-8'), null, 'UTF-8');
            if ($nameTail === '' || preg_match('/^\s/u', $nameTail) === 1) {
                return ['tier' => 1, 'score' => max($score, self::similarityScore($normalizedQuery, $normalizedName)), 'full' => $full, 'full_len' => $fullLen];
            }
        }

        if (str_starts_with($full, $normalizedQuery)) {
            $tail = mb_substr($full, mb_strlen($normalizedQuery, 'UTF-8'), null, 'UTF-8');
            if ($tail === '' || preg_match('/^\s/u', $tail) === 1) {
                return ['tier' => 1, 'score' => $score, 'full' => $full, 'full_len' => $fullLen];
            }
        }

        // Смежная фраза в названии («… The One …») выше разрозненных токенов («The Only One»).
        if (str_contains($normalizedName, $normalizedQuery) || str_contains($full, $normalizedQuery)) {
            $nameScore = str_contains($normalizedName, $normalizedQuery)
                ? self::similarityScore($normalizedQuery, $normalizedName)
                : $score;

            return ['tier' => 2, 'score' => max($score, $nameScore), 'full' => $full, 'full_len' => $fullLen];
        }

        return ['tier' => 3, 'score' => $score, 'full' => $full, 'full_len' => $fullLen];
    }

    public static function diceCoefficient(string $a, string $b): float
    {
        if ($a === '' || $b === '') {
            return 0.0;
        }
        if ($a === $b) {
            return 1.0;
        }

        $aBigrams = self::mbBigrams($a);
        $bBigrams = self::mbBigrams($b);

        if (empty($aBigrams) || empty($bBigrams)) {
            return 0.0;
        }

        $aCounts = array_count_values($aBigrams);
        $bCounts = array_count_values($bBigrams);
        $intersection = 0;

        foreach ($aCounts as $gram => $count) {
            if (!isset($bCounts[$gram])) {
                continue;
            }
            $intersection += min($count, $bCounts[$gram]);
        }

        return (2 * $intersection) / (count($aBigrams) + count($bBigrams));
    }

    /**
     * @return string[]
     */
    public static function mbBigrams(string $value): array
    {
        $length = mb_strlen($value, 'UTF-8');
        if ($length < 2) {
            return [];
        }

        $grams = [];
        for ($i = 0; $i < $length - 1; $i++) {
            $grams[] = mb_substr($value, $i, 2, 'UTF-8');
        }

        return $grams;
    }

    public static function escapeLikeValue(string $value): string
    {
        return addcslashes($value, '%_\\');
    }
}
