<?php

namespace Modules\ImportExport\Services\Allparfume\Support;

final class AllparfumeOwnShopFilter
{
    /**
     * @param  array{shop_key?:mixed,shop_name?:mixed}  $offer
     */
    public static function isOwnShop(array $offer): bool
    {
        return self::isOwnShopKey((string) ($offer['shop_key'] ?? ''))
            || self::isOwnShopName((string) ($offer['shop_name'] ?? ''));
    }

    public static function isOwnShopKey(string $shopKey): bool
    {
        $key = mb_strtolower(trim($shopKey));

        return $key === 'perfumer-by' || $key === 'perfumer.by' || str_starts_with($key, 'perfumer-by');
    }

    public static function isOwnShopName(string $shopName): bool
    {
        $name = mb_strtolower(trim($shopName));
        if ($name === '') {
            return false;
        }

        $normalized = preg_replace('/\s+/u', '', $name) ?? $name;

        return str_contains($normalized, 'perfumer.by')
            || str_contains($normalized, 'perfumer-by')
            || $normalized === 'perfumerby';
    }
}
