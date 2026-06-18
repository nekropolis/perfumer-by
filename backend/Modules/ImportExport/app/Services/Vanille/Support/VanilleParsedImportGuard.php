<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;

/**
 * Не импортировать категории Vanille. Карточка товара обязана иметь характеристики (будущие атрибуты в каталоге).
 */
final class VanilleParsedImportGuard
{
    /** @var list<string> */
    private const PRODUCT_CHARACTERISTIC_KEYS = [
        'бренд',
        'пол',
        'год создания',
        'года создания',
        'типы',
        'объем',
        'объём',
        'сделано в',
        'основной акцент',
        'семейства',
        'ноты',
    ];

    /** @var list<string> */
    private const GARBAGE_PRODUCT_TITLES = [
        'духи',
        'пробники',
        'парфюмерная вода',
        'туалетная вода',
        'одеколоны',
        'парфюмерия',
        'о регистрации',
        'свидетельство',
    ];

    /**
     * Причина пропуска или null, если импорт разрешён.
     */
    public static function skipReason(array $item): ?string
    {
        $url = trim((string) ($item['url'] ?? ''));
        $brandName = trim((string) ($item['brand'] ?? ''));
        $pathSlug = self::urlPathSlug($url);

        if ($url === '' || !self::isVanilleProductUrl($url)) {
            return 'не URL товара Vanille';
        }

        if ($pathSlug !== '' && VanilleBrandParser::isExcludedListingSlug($pathSlug)) {
            return 'URL категории/служебной страницы: ' . $pathSlug;
        }

        if ($brandName === '') {
            return 'нет бренда на карточке';
        }

        if (VanilleBrandParser::isGarbageBrandRow($brandName, $pathSlug, $url)) {
            return 'бренд/страница в списке исключений: ' . $brandName;
        }

        if (!VanilleBrandParser::isAllowedImportBrand($brandName, $url)) {
            return 'бренд не в brands.json (категория или мусор): ' . $brandName;
        }

        $title = mb_strtolower(trim((string) ($item['name'] ?? $item['page_title'] ?? '')), 'UTF-8');
        if ($title !== '' && in_array($title, self::GARBAGE_PRODUCT_TITLES, true)) {
            return 'заголовок категории, не товар: ' . $title;
        }

        if (ProductDisplayName::brandNamesEquivalent($brandName, $title)) {
            return 'название совпадает с брендом (страница категории)';
        }

        if (!self::hasProductCharacteristics($item, $brandName, $pathSlug, $url)) {
            return 'нет характеристик товара (без атрибутов не импортируем)';
        }

        return null;
    }

    /**
     * Реальный товар может быть без цен/остатка на Vanille (пустые offers), но с таблицей характеристик.
     */
    private static function hasProductCharacteristics(array $item, string $brandName, string $pathSlug, string $productUrl): bool
    {
        $characteristics = is_array($item['characteristics'] ?? null) ? $item['characteristics'] : [];
        if ($characteristics === []) {
            return false;
        }

        $normalizedKeys = [];
        foreach (array_keys($characteristics) as $key) {
            $normalizedKeys[] = mb_strtolower(trim((string) $key), 'UTF-8');
        }

        foreach (self::PRODUCT_CHARACTERISTIC_KEYS as $needle) {
            if (in_array($needle, $normalizedKeys, true)) {
                return self::characteristicsLookLikeProduct($characteristics, $brandName, $pathSlug, $productUrl);
            }
        }

        if (count($characteristics) >= 3) {
            return self::characteristicsLookLikeProduct($characteristics, $brandName, $pathSlug, $productUrl);
        }

        $gallery = is_array($item['gallery_image_urls'] ?? null) ? $item['gallery_image_urls'] : [];
        if ($gallery !== [] && in_array('бренд', $normalizedKeys, true)) {
            return self::characteristicsLookLikeProduct($characteristics, $brandName, $pathSlug, $productUrl);
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $characteristics
     */
    private static function characteristicsLookLikeProduct(
        array $characteristics,
        string $brandName,
        string $pathSlug,
        string $productUrl,
    ): bool {
        $catalogBrand = VanilleBrandParser::findCatalogBrandRow($brandName, $productUrl);
        if ($catalogBrand === null) {
            return false;
        }

        $brandSlug = mb_strtolower(trim((string) ($catalogBrand['slug'] ?? '')), 'UTF-8');
        if ($brandSlug !== '' && $pathSlug === $brandSlug) {
            return false;
        }

        $charBrand = trim((string) ($characteristics['Бренд'] ?? $characteristics['бренд'] ?? ''));
        if ($charBrand !== '' && !ProductDisplayName::brandNamesEquivalent($brandName, $charBrand)) {
            return false;
        }

        return true;
    }

    private static function urlPathSlug(string $url): string
    {
        $path = trim((string) parse_url($url, PHP_URL_PATH), '/');

        return $path !== '' ? mb_strtolower($path, 'UTF-8') : '';
    }

    private static function isVanilleProductUrl(string $url): bool
    {
        $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST), 'UTF-8');

        return in_array($host, ['vanille.by', 'www.vanille.by'], true);
    }
}
