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

        $prefixPattern = '/^'.preg_quote($brandName, '/').'\s*/iu';
        if (preg_match($prefixPattern, $productName) === 1) {
            $rest = trim((string) preg_replace($prefixPattern, '', $productName, 1));
            if ($rest !== '' && mb_strtolower($rest, 'UTF-8') !== mb_strtolower($productName, 'UTF-8')) {
                return ['found' => true, 'name' => self::normalizeSpaces($rest)];
            }
        }

        $escaped = preg_quote($brandName, '/');
        $inlinePattern = '/(?:^|\s)'.$escaped.'(?:\s|$)/iu';
        if (preg_match($inlinePattern, $productName) === 1) {
            $rest = trim((string) preg_replace($inlinePattern, ' ', $productName));
            $rest = self::normalizeSpaces($rest);
            if ($rest !== '' && mb_strtolower($rest, 'UTF-8') !== mb_strtolower($productName, 'UTF-8')) {
                return ['found' => true, 'name' => $rest];
            }
        }

        return ['found' => false, 'name' => $productName];
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

        return $brandSlug.'-'.$productSlug;
    }

    public static function buildSlugForProduct(Product $product): string
    {
        $product->loadMissing('brand:id,slug');

        return self::buildSlug($product->brand?->slug, (string) $product->name);
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
