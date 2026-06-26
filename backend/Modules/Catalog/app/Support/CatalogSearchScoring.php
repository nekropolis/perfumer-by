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
        if (str_contains($haystack, $needle)) {
            return self::SCORE_SIMILARITY_CONTAINS;
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
