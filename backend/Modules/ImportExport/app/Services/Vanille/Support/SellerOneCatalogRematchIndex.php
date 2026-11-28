<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Illuminate\Support\Collection;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;

/**
 * Дешёвый индекс имён каталога для повторного парсинга.
 *
 * Полный матчер для несвязанной строки с тем же названием запускается только когда
 * у строки ещё нет предложения и имя линии уже есть у бренда, а список имён бренда
 * изменился с прошлой неудачной попытки.
 */
final class SellerOneCatalogRematchIndex
{
    /** @var list<string> */
    private const array NAME_SUFFIXES = [
        'eau de parfum',
        'pour femme',
        'pour homme',
        'for woman',
        'for her',
        'for man',
        'for him',
        'woman',
        'unisex',
        'her',
        'man',
        'him',
    ];

    /**
     * @param  Collection<int, Brand>  $brands
     * @param  array<int, list<Product>>  $productsIndex
     * @return array{
     *     name_keys: array<string, true>,
     *     hashes: array<int, string>,
     *     brand_ids: array<string, int>,
     *     brands_by_first_token: array<string, list<array{id:int, normalized:string}>>
     * }
     */
    public static function build(Collection $brands, array $productsIndex): array
    {
        $brandRows = [];
        foreach ($brands as $brand) {
            $brandRows[] = [
                'id' => (int) $brand->id,
                'name' => (string) $brand->name,
            ];
        }

        $productsByBrand = [];
        foreach ($productsIndex as $brandId => $products) {
            foreach ($products as $product) {
                $productsByBrand[(int) $brandId][] = [
                    'id' => (int) $product->id,
                    'name' => (string) $product->name,
                ];
            }
        }

        return self::buildFromRows($brandRows, $productsByBrand);
    }

    /**
     * @param  list<array{id:int, name:string}>  $brands
     * @param  array<int, list<array{id:int, name:string}>>  $productsByBrand
     * @return array{
     *     name_keys: array<string, true>,
     *     hashes: array<int, string>,
     *     brand_ids: array<string, int>,
     *     brands_by_first_token: array<string, list<array{id:int, normalized:string}>>
     * }
     */
    public static function buildFromRows(array $brands, array $productsByBrand): array
    {
        $nameKeys = [];
        $hashes = [];
        $brandIds = [];
        $brandsByFirstToken = [];

        foreach ($brands as $brand) {
            $normalized = self::normalize($brand['name']);
            if ($normalized === '') {
                continue;
            }

            $brandId = (int) $brand['id'];
            if (! isset($brandIds[$normalized]) || isset($productsByBrand[$brandId])) {
                $brandIds[$normalized] = $brandId;
            }

            $firstToken = strtok($normalized, ' ');
            if ($firstToken === false || $firstToken === '') {
                continue;
            }

            $brandsByFirstToken[$firstToken][] = [
                'id' => $brandId,
                'normalized' => $normalized,
            ];
        }

        foreach ($productsByBrand as $brandId => $products) {
            $lines = [];
            foreach ($products as $product) {
                $normalizedName = self::normalize($product['name']);
                $lines[] = ((int) $product['id']).'|'.$normalizedName;
                foreach (self::nameKeys($normalizedName) as $key) {
                    $nameKeys[$brandId."\0".$key] = true;
                }
            }
            $hashes[(int) $brandId] = self::hashLines($lines);
        }

        return [
            'name_keys' => $nameKeys,
            'hashes' => $hashes,
            'brand_ids' => $brandIds,
            'brands_by_first_token' => $brandsByFirstToken,
        ];
    }

    public static function normalize(string $value): string
    {
        $value = mb_strtolower($value);
        $value = preg_replace('/[^[:alnum:]\s]+/u', ' ', $value) ?: '';
        $value = preg_replace('/\s+/u', ' ', trim($value)) ?: '';

        return $value;
    }

    /**
     * Полное имя и то же имя без известного хвоста линии (пол, Eau de Parfum, unisex).
     *
     * @return list<string>
     */
    public static function nameKeys(string $normalizedProductName): array
    {
        $name = trim($normalizedProductName);
        if ($name === '') {
            return [];
        }

        $keys = [$name];
        $current = $name;
        for ($i = 0; $i < 2; $i++) {
            $stripped = self::stripOneSuffix($current);
            if ($stripped === null) {
                break;
            }
            $keys[] = $stripped;
            $current = $stripped;
        }

        return array_values(array_unique($keys));
    }

    /**
     * @param  list<string>  $lines
     */
    public static function hashLines(array $lines): string
    {
        sort($lines, SORT_STRING);

        return sprintf('%u', crc32(implode("\n", $lines)));
    }

    public static function shouldRematch(
        mixed $suggestedProductId,
        mixed $suggestedVariantId,
        bool $nameInCatalog,
        ?string $storedCatalogHash,
        ?string $currentBrandHash,
    ): bool {
        if (self::positiveId($suggestedProductId) || self::positiveId($suggestedVariantId)) {
            return false;
        }

        if (! $nameInCatalog) {
            return false;
        }

        if ($currentBrandHash !== null && $storedCatalogHash === $currentBrandHash) {
            return false;
        }

        return true;
    }

    /**
     * @param  array{
     *     name_keys: array<string, true>,
     *     hashes: array<int, string>,
     *     brand_ids: array<string, int>,
     *     brands_by_first_token: array<string, list<array{id:int, normalized:string}>>
     * }  $index
     * @return array{brand_id: int, name: string}|null
     */
    public static function resolveLine(
        string $brandName,
        string $productName,
        string $titleLine,
        array $index,
    ): ?array {
        $brandName = trim($brandName);
        $productName = trim($productName);
        if ($brandName !== '' && $productName !== '') {
            $brandId = $index['brand_ids'][self::normalize($brandName)] ?? null;
            if ($brandId === null) {
                return null;
            }

            $normalizedProduct = self::normalize($productName);
            if ($normalizedProduct === '') {
                return null;
            }

            return [
                'brand_id' => $brandId,
                'name' => $normalizedProduct,
            ];
        }

        $titleLine = (string) preg_replace('/\(\s*[mlwu]\s*\)/iu', ' ', $titleLine);
        $normalizedTitle = self::normalize($titleLine);
        if ($normalizedTitle === '') {
            return null;
        }

        $brand = self::detectBrand($normalizedTitle, $index);
        if ($brand === null && $brandName !== '') {
            $brandId = $index['brand_ids'][self::normalize($brandName)] ?? null;
            if ($brandId !== null) {
                $brand = [
                    'id' => $brandId,
                    'normalized' => self::normalize($brandName),
                ];
            }
        }
        if ($brand === null) {
            return null;
        }

        $lineName = self::stripBrandPrefix($normalizedTitle, $brand['normalized']);
        if ($lineName === '') {
            return null;
        }

        return [
            'brand_id' => $brand['id'],
            'name' => $lineName,
        ];
    }

    /**
     * @param  array{
     *     name_keys: array<string, true>,
     *     hashes: array<int, string>,
     *     brand_ids: array<string, int>,
     *     brands_by_first_token: array<string, list<array{id:int, normalized:string}>>
     * }  $index
     */
    public static function containsName(array $index, int $brandId, string $normalizedProductName): bool
    {
        return isset($index['name_keys'][$brandId."\0".$normalizedProductName]);
    }

    /**
     * @param  array{brands_by_first_token: array<string, list<array{id:int, normalized:string}>>}  $index
     * @return array{id:int, normalized:string}|null
     */
    public static function detectBrand(string $normalizedTitle, array $index): ?array
    {
        $space = strpos($normalizedTitle, ' ');
        $firstToken = $space === false ? $normalizedTitle : substr($normalizedTitle, 0, $space);
        if ($firstToken === '') {
            return null;
        }

        $best = null;
        $bestLength = 0;
        foreach ($index['brands_by_first_token'][$firstToken] ?? [] as $brand) {
            $normalized = $brand['normalized'];
            if ($normalized === '' || ! str_starts_with($normalizedTitle, $normalized)) {
                continue;
            }

            $length = strlen($normalized);
            $boundaryOk = strlen($normalizedTitle) === $length || ($normalizedTitle[$length] ?? '') === ' ';
            if (! $boundaryOk || $length <= $bestLength) {
                continue;
            }

            $best = $brand;
            $bestLength = $length;
        }

        return $best;
    }

    private static function stripBrandPrefix(string $normalizedTitle, string $normalizedBrand): string
    {
        if ($normalizedBrand === '') {
            return $normalizedTitle;
        }

        if ($normalizedTitle === $normalizedBrand) {
            return '';
        }

        $prefix = $normalizedBrand.' ';
        if (! str_starts_with($normalizedTitle, $prefix)) {
            return $normalizedTitle;
        }

        return trim(substr($normalizedTitle, strlen($prefix)));
    }

    private static function stripOneSuffix(string $name): ?string
    {
        foreach (self::NAME_SUFFIXES as $suffix) {
            $needle = ' '.$suffix;
            if (str_ends_with($name, $needle) && strlen($name) > strlen($needle)) {
                $stripped = trim(substr($name, 0, -strlen($needle)));
                if ($stripped !== '') {
                    return $stripped;
                }
            }
        }

        return null;
    }

    private static function positiveId(mixed $value): bool
    {
        if ($value === null || $value === '' || $value === false) {
            return false;
        }

        return (int) $value > 0;
    }
}
