<?php

namespace Modules\Catalog\Support;

/**
 * PHP-аналог frontend buildAutomaticProductMetaTitle / buildProductMetaTitle.
 */
final class ProductMetaTitleBuilder
{
    public const MAX_LENGTH = 60;

    public static function isManualOverride(?string $seoTitle, string $displayName): bool
    {
        $trimmed = trim((string) $seoTitle);

        return $trimmed !== '' && $trimmed !== $displayName;
    }

    public static function buildAutomatic(string $displayName, ?string $priceMin = null): string
    {
        $name = trim($displayName);
        $price = self::formatPrice($priceMin);

        $withPrice = $price !== ''
            ? $name.' купить в Минске и Беларуси — цена '.$price.' BYN'
            : null;

        if ($withPrice !== null && mb_strlen($withPrice) <= self::MAX_LENGTH) {
            return $withPrice;
        }

        $candidates = [
            $name.' купить в Минске и Беларуси',
            $name.' купить в Минске',
            $name.' купить',
            $name,
        ];

        foreach ($candidates as $candidate) {
            if (mb_strlen($candidate) <= self::MAX_LENGTH) {
                return $candidate;
            }
        }

        return mb_substr($name, 0, self::MAX_LENGTH);
    }

    public static function build(?string $seoTitle, string $displayName, ?string $priceMin = null): string
    {
        if (self::isManualOverride($seoTitle, $displayName)) {
            return trim((string) $seoTitle);
        }

        return self::buildAutomatic($displayName, $priceMin);
    }

    private static function formatPrice(?string $priceMin): string
    {
        if ($priceMin === null) {
            return '';
        }

        $normalized = trim(str_replace([',', ' '], ['.', ''], $priceMin));
        if ($normalized === '') {
            return '';
        }

        if (! is_numeric($normalized)) {
            return '';
        }

        return number_format((float) $normalized, 2, '.', '');
    }
}
