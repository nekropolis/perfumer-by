<?php

namespace Modules\Catalog\Support;

use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\ImportExport\Support\VanilleHelper;

final class ProductDisplayName
{
    /**
     * Визуальные двойники латиницы (кириллица в «Chanel» / «Classic»).
     * Буквы без пары (б, д, ж, и, л…) не трогаем — это настоящий русский текст.
     *
     * @var array<string, string>
     */
    private const CYRILLIC_LATIN_LOOKALIKES = [
        'А' => 'A', 'а' => 'a',
        'В' => 'B',
        'Е' => 'E', 'е' => 'e', 'Ё' => 'E', 'ё' => 'e',
        'К' => 'K',
        'М' => 'M',
        'Н' => 'H',
        'О' => 'O', 'о' => 'o',
        'Р' => 'P', 'р' => 'p',
        'С' => 'C', 'с' => 'c',
        'Т' => 'T',
        'У' => 'Y', 'у' => 'y',
        'Х' => 'X', 'х' => 'x',
        'І' => 'I', 'і' => 'i',
        'Ї' => 'I', 'ї' => 'i',
        'Ј' => 'J', 'ј' => 'j',
        'Ѕ' => 'S', 'ѕ' => 's',
    ];

    public static function format(?string $brandName, string $productName): string
    {
        $brandName = trim((string) $brandName);
        $productName = trim($productName);

        if ($brandName === '') {
            return self::replaceCyrillicLookalikes($productName);
        }

        if ($productName === '') {
            return self::replaceCyrillicLookalikes($brandName);
        }

        return self::replaceCyrillicLookalikes($brandName.' '.$productName);
    }

    /**
     * В словах без «настоящей» кириллицы заменить двойники на латиницу.
     * «Сhanel» → «Chanel»; «Набор женский» и «(ВДНХ)» не меняются.
     */
    public static function replaceCyrillicLookalikes(string $value): string
    {
        if ($value === '' || preg_match('/\p{Cyrillic}/u', $value) !== 1) {
            return $value;
        }

        $replaced = preg_replace_callback('/\p{L}+/u', static function (array $match): string {
            $word = $match[0];
            $chars = preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            foreach ($chars as $ch) {
                if (preg_match('/\p{Cyrillic}/u', $ch) === 1 && ! isset(self::CYRILLIC_LATIN_LOOKALIKES[$ch])) {
                    return $word;
                }
            }

            $out = '';
            foreach ($chars as $ch) {
                $out .= self::CYRILLIC_LATIN_LOOKALIKES[$ch] ?? $ch;
            }

            return $out;
        }, $value);

        return is_string($replaced) ? $replaced : $value;
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
                if ($rest !== '') {
                    return self::normalizeSpaces($rest);
                }
            }

            $escaped = preg_quote($variant, '/');
            $inlinePattern = '/(?:^|\s)'.$escaped.'(?:\s|$)/iu';
            if (preg_match($inlinePattern, $productName) === 1) {
                $rest = self::normalizeSpaces(trim((string) preg_replace($inlinePattern, ' ', $productName)));
                if ($rest !== '') {
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
        return self::brandEquivalentKey($a) === self::brandEquivalentKey($b);
    }

    /** Ключ для сопоставления брендов (A'PIEU = A'PIEU, Dolce & Gabbana = Dolce&Gabbana). */
    public static function brandEquivalentKey(string $value): string
    {
        return self::normalizeBrandKey($value);
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
     * Каноническое короткое имя: сначала h1/заголовок Vanille (с регистром), иначе path URL.
     *
     * @param  list<string>  $casingSources  Доп. строки с регистром (h1, «Аромат», page_title).
     */
    public static function resolveCanonicalShortName(
        string $brandName,
        string $brandSlug,
        string $fullTitle,
        string $vanilleUrl,
        array $casingSources = [],
    ): string {
        $brandSlug = VanilleHelper::slugify($brandSlug);
        $candidates = self::uniqueNonEmptyStrings(array_merge([$fullTitle], $casingSources));

        foreach ($candidates as $candidate) {
            $short = self::shortNameFromBrandTitle($brandName, $candidate);
            if ($short !== '') {
                return $short;
            }
        }

        $urlKey = $vanilleUrl !== '' ? self::vanilleProductPathIdentityKey($brandSlug, $vanilleUrl) : '';
        if ($urlKey !== '') {
            $fromSlug = self::shortNameFromPathIdentityKey($urlKey);
            foreach ($candidates as $candidate) {
                $short = self::shortNameFromBrandTitle($brandName, $candidate);
                if ($short !== '' && self::nameWordsKey($short) === self::nameWordsKey($fromSlug)) {
                    return $short;
                }
            }

            return $fromSlug;
        }

        return '';
    }

    private static function shortNameFromBrandTitle(string $brandName, string $title): string
    {
        $title = trim($title);
        if ($title === '') {
            return '';
        }

        $strip = self::stripBrandFromName($brandName, $title);
        if ($strip['found']) {
            $fromTitle = $strip['name'];
            if ($fromTitle !== '' && ! self::brandNamesEquivalent($brandName, $fromTitle)) {
                return $fromTitle;
            }

            return '';
        }

        if (trim($brandName) === '') {
            return $title;
        }

        return '';
    }

    public static function nameWordsEquivalent(string $a, string $b): bool
    {
        return self::nameWordsKey($a) === self::nameWordsKey($b);
    }

    private static function nameWordsKey(string $value): string
    {
        $value = mb_strtolower(trim($value), 'UTF-8');
        $value = preg_replace('/[^[:alnum:]\s]+/u', ' ', $value) ?? '';
        $parts = preg_split('/\s+/u', trim($value)) ?: [];

        return implode(' ', array_values(array_filter($parts, static fn (string $part): bool => $part !== '')));
    }

    /**
     * @param  list<string>  $values
     * @return list<string>
     */
    private static function uniqueNonEmptyStrings(array $values): array
    {
        $out = [];
        foreach ($values as $value) {
            $value = trim((string) $value);
            if ($value === '' || in_array($value, $out, true)) {
                continue;
            }
            $out[] = $value;
        }

        return $out;
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
