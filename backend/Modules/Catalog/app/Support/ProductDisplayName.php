<?php

namespace Modules\Catalog\Support;

use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\ImportExport\Support\VanilleHelper;

final class ProductDisplayName
{
    public static function format(?string $brandName, string $productName): string
    {
        $brandName = trim((string) $brandName);
        $productName = trim($productName);

        if ($brandName === '') {
            return $productName;
        }

        if ($productName === '') {
            return $brandName;
        }

        return $brandName.' '.$productName;
    }

    public static function forProduct(Product $product): string
    {
        $product->loadMissing('brand:id,name,slug');

        return self::format($product->brand?->name, (string) $product->name);
    }

    /**
     * @return array{found: bool, name: string}
     */
    /**
     * Нормализация legacy/OpenCart названия: снять бренд, вернуть короткое имя и display.
     *
     * @return array{short_name: string, display_name: string, brand_stripped: bool}
     */
    public static function normalizeLegacyProductTitle(string $legacyTitle, ?string $brandName): array
    {
        $legacyTitle = trim($legacyTitle);
        $brandName = trim((string) $brandName);
        $strip = self::stripBrandFromName($brandName, $legacyTitle);
        $shortName = $strip['found'] ? $strip['name'] : $legacyTitle;

        return [
            'short_name' => $shortName,
            'display_name' => self::format($brandName, $shortName),
            'brand_stripped' => $strip['found'],
        ];
    }

    public static function stripBrandFromName(string $brandName, string $productName): array
    {
        $brandName = trim($brandName);
        $productName = trim($productName);

        if ($brandName === '' || $productName === '') {
            return ['found' => false, 'name' => $productName];
        }

        $rest = $productName;
        $stripped = false;

        for ($i = 0; $i < 5; $i++) {
            $next = self::stripBrandFromNameOnce($brandName, $rest);
            if ($next === null) {
                break;
            }
            $rest = $next;
            $stripped = true;
        }

        if ($stripped && self::brandNamesEquivalent($brandName, $rest)) {
            return ['found' => true, 'name' => ''];
        }

        if ($stripped && $rest !== '') {
            return ['found' => true, 'name' => $rest];
        }

        return ['found' => false, 'name' => $productName];
    }

    /**
     * Одна итерация снятия бренда (префикс / вхождение). null — больше нечего снимать.
     */
    private static function stripBrandFromNameOnce(string $brandName, string $productName): ?string
    {
        $variants = self::brandNameMatchVariants($brandName);
        foreach ($variants as $variant) {
            if ($variant === '') {
                continue;
            }

            $prefixPattern = '/^'.preg_quote($variant, '/').'\s*/iu';
            if (preg_match($prefixPattern, $productName) === 1) {
                $rest = trim((string) preg_replace($prefixPattern, '', $productName, 1));
                if ($rest !== '' && !self::brandNamesEquivalent($variant, $rest)) {
                    return self::normalizeSpaces($rest);
                }
            }

            $escaped = preg_quote($variant, '/');
            $inlinePattern = '/(?:^|\s)'.$escaped.'(?:\s|$)/iu';
            if (preg_match($inlinePattern, $productName) === 1) {
                $rest = self::normalizeSpaces(trim((string) preg_replace($inlinePattern, ' ', $productName)));
                if ($rest !== '' && !self::brandNamesEquivalent($variant, $rest)) {
                    return $rest;
                }
            }
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private static function brandNameMatchVariants(string $brandName): array
    {
        $brandName = trim($brandName);
        $variants = [$brandName];
        $noAmp = str_replace('&', ' and ', $brandName);
        $withAmp = preg_replace('/\band\b/iu', '&', $brandName) ?? $brandName;
        foreach ([$noAmp, $withAmp, str_replace(' ', '', $brandName)] as $variant) {
            $variant = self::normalizeSpaces($variant);
            if ($variant !== '' && !in_array($variant, $variants, true)) {
                $variants[] = $variant;
            }
        }

        return $variants;
    }

    public static function brandNamesEquivalent(string $a, string $b): bool
    {
        return self::normalizeBrandKey($a) === self::normalizeBrandKey($b);
    }

    private static function normalizeBrandKey(string $value): string
    {
        $value = mb_strtolower(trim($value), 'UTF-8');
        $value = str_replace('&', 'and', $value);
        $value = preg_replace('/\s+/u', '', $value) ?? '';
        $value = preg_replace('/[^a-z0-9]+/u', '', $value) ?? '';

        return $value;
    }

    public static function buildSlug(?string $brandSlug, string $productName): string
    {
        $productSlug = VanilleHelper::slugify($productName);
        $brandSlug = VanilleHelper::slugify((string) $brandSlug);

        if ($brandSlug === '') {
            return $productSlug !== '' ? $productSlug : 'product';
        }

        if ($productSlug === '') {
            return $brandSlug;
        }

        if ($productSlug === $brandSlug) {
            return $brandSlug;
        }

        if (str_starts_with($productSlug, $brandSlug . '-')) {
            return $productSlug;
        }

        return $brandSlug . '-' . $productSlug;
    }

    /**
     * Короткое имя товара из URL Vanille, если в h1 остался только бренд.
     */
    public static function productShortNameFromVanilleUrl(string $url, string $brandSlug): string
    {
        $path = trim((string) parse_url($url, PHP_URL_PATH), '/');
        if ($path === '') {
            return '';
        }

        $brandSlug = VanilleHelper::slugify($brandSlug);
        $slug = VanilleHelper::slugify($path);
        if ($slug === '' || $slug === $brandSlug) {
            return '';
        }

        if (str_starts_with($slug, $brandSlug . '-')) {
            $slug = substr($slug, strlen($brandSlug) + 1);
        }

        $parts = array_values(array_filter(explode('-', $slug)));
        if ($parts === []) {
            return '';
        }

        return self::normalizeSpaces(implode(' ', $parts));
    }

    public static function buildSlugForProduct(Product $product): string
    {
        $product->loadMissing('brand:id,slug');

        return self::buildSlug($product->brand?->slug, (string) $product->name);
    }

    /**
     * Ключ одного и того же аромата: путь/slug без префикса бренда и без повторов сегмента бренда
     * (kenzo-tokyo-by-kenzo-ryoko и kenzo-tokyo-by-ryoko → tokyo-by-ryoko).
     */
    public static function vanilleProductPathIdentityKey(string $brandSlug, string $urlOrSlugPath): string
    {
        $slug = self::pathToSlug($urlOrSlugPath);
        $brandSlug = VanilleHelper::slugify($brandSlug);
        if ($slug === '' || $brandSlug === '') {
            return $slug;
        }

        if ($slug === $brandSlug) {
            return '';
        }

        if (str_starts_with($slug, $brandSlug . '-')) {
            $slug = substr($slug, strlen($brandSlug) + 1);
        }

        $brandTokens = array_values(array_filter(explode('-', $brandSlug)));
        $parts = array_values(array_filter(
            explode('-', $slug),
            static fn (string $part): bool => $part !== '' && !in_array($part, $brandTokens, true),
        ));

        return implode('-', $parts);
    }

    public static function shortNameFromPathIdentityKey(string $pathIdentityKey): string
    {
        $pathIdentityKey = trim($pathIdentityKey);
        if ($pathIdentityKey === '') {
            return '';
        }

        return self::normalizeSpaces(implode(' ', explode('-', $pathIdentityKey)));
    }

    /**
     * Каноническое короткое имя: сначала URL Vanille, иначе заголовок (с полным снятием бренда).
     */
    public static function resolveCanonicalShortName(
        string $brandName,
        string $brandSlug,
        string $fullTitle,
        string $vanilleUrl,
    ): string {
        $brandSlug = VanilleHelper::slugify($brandSlug);
        $urlKey = $vanilleUrl !== '' ? self::vanilleProductPathIdentityKey($brandSlug, $vanilleUrl) : '';
        if ($urlKey !== '') {
            return self::shortNameFromPathIdentityKey($urlKey);
        }

        $strip = self::stripBrandFromName($brandName, trim($fullTitle));
        $fromTitle = $strip['found'] ? $strip['name'] : trim($fullTitle);
        if ($fromTitle === '' || self::brandNamesEquivalent($brandName, $fromTitle)) {
            return '';
        }

        $titleKey = self::vanilleProductPathIdentityKey($brandSlug, VanilleHelper::slugify($fromTitle));

        return $titleKey !== ''
            ? self::shortNameFromPathIdentityKey($titleKey)
            : $fromTitle;
    }

    private static function pathToSlug(string $urlOrSlugPath): string
    {
        $value = trim($urlOrSlugPath);
        if ($value === '') {
            return '';
        }

        if (str_contains($value, '://')) {
            $value = trim((string) parse_url($value, PHP_URL_PATH), '/');
        } else {
            $value = trim($value, '/');
        }

        return VanilleHelper::slugify($value);
    }

    public static function resolveUniqueProductSlug(string $baseSlug, ?int $ignoreProductId = null): string
    {
        $baseSlug = VanilleHelper::slugify($baseSlug);
        if ($baseSlug === '') {
            $baseSlug = 'product';
        }

        if (Brand::query()->where('slug', $baseSlug)->exists()) {
            $baseSlug .= '-item';
        }

        $slug = $baseSlug;
        $suffix = 2;

        while (self::productSlugTaken($slug, $ignoreProductId)) {
            $slug = $baseSlug.'-'.$suffix;
            $suffix++;
        }

        return $slug;
    }

    private static function productSlugTaken(string $slug, ?int $ignoreProductId): bool
    {
        $query = Product::query()->where('slug', $slug);
        if ($ignoreProductId !== null && $ignoreProductId > 0) {
            $query->where('id', '!=', $ignoreProductId);
        }

        return $query->exists();
    }

    private static function normalizeSpaces(string $value): string
    {
        return preg_replace('/\s+/u', ' ', trim($value)) ?: '';
    }
}
