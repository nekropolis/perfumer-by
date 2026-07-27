<?php

namespace Modules\ImportExport\Services\Allparfume\Support;

use Modules\ImportExport\Models\AllparfumeShop;
use Modules\ImportExport\Models\AllparfumeShopOffer;

final class AllparfumeShopRegistry
{
    /**
     * @param  array{shop_key?:mixed,shop_name?:mixed,shop_url?:mixed}  $offer
     */
    public function ensureFromOffer(array $offer): AllparfumeShop
    {
        $shopKey = trim((string) ($offer['shop_key'] ?? ''));
        if ($shopKey === '') {
            $shopKey = 'unknown';
        }

        $shopName = trim((string) ($offer['shop_name'] ?? ''));
        if ($shopName === '') {
            $shopName = $shopKey;
        }

        $shopUrl = isset($offer['shop_url']) ? trim((string) $offer['shop_url']) : null;
        if ($shopUrl === '') {
            $shopUrl = null;
        }

        $isOwn = AllparfumeOwnShopFilter::isOwnShop($offer);

        $shop = AllparfumeShop::query()->firstOrCreate(
            ['shop_key' => $shopKey],
            [
                'shop_name' => $shopName,
                'shop_url' => $shopUrl,
                'is_active' => ! $isOwn,
                'offers_count' => 0,
            ],
        );

        $dirty = false;
        if ($shopName !== '' && $shop->shop_name !== $shopName) {
            $shop->shop_name = $shopName;
            $dirty = true;
        }
        if ($shopUrl !== null && $shop->shop_url !== $shopUrl) {
            $shop->shop_url = $shopUrl;
            $dirty = true;
        }
        if ($isOwn && $shop->is_active) {
            $shop->is_active = false;
            $dirty = true;
        }
        if ($dirty) {
            $shop->save();
        }

        return $shop;
    }

    public function isActiveShopKey(string $shopKey): bool
    {
        $shopKey = trim($shopKey);
        if ($shopKey === '') {
            return false;
        }

        $shop = AllparfumeShop::query()->where('shop_key', $shopKey)->first();
        if (! $shop instanceof AllparfumeShop) {
            // Unknown shops are treated as active until registered (sync will register).
            return true;
        }

        return (bool) $shop->is_active;
    }

    public function setActive(AllparfumeShop $shop, bool $isActive): AllparfumeShop
    {
        $shop->is_active = $isActive;
        $shop->save();

        AllparfumeShopOffer::query()
            ->where('shop_key', $shop->shop_key)
            ->update([
                'include_in_pricing' => $isActive,
                'is_active' => $isActive,
            ]);

        return $shop->fresh() ?? $shop;
    }

    public function refreshOffersCount(AllparfumeShop $shop): void
    {
        $count = (int) AllparfumeShopOffer::query()
            ->where('shop_key', $shop->shop_key)
            ->count();
        $shop->offers_count = $count;
        $shop->save();
    }

    /**
     * Create/update shop rows from already stored offers (no crawl needed).
     */
    public function syncFromExistingOffers(): int
    {
        $rows = AllparfumeShopOffer::query()
            ->selectRaw('shop_key, MAX(shop_name) as shop_name, MAX(shop_url) as shop_url, COUNT(*) as offers_count')
            ->whereNotNull('shop_key')
            ->where('shop_key', '!=', '')
            ->groupBy('shop_key')
            ->get();

        $touched = 0;
        foreach ($rows as $row) {
            $shop = $this->ensureFromOffer([
                'shop_key' => (string) $row->shop_key,
                'shop_name' => (string) ($row->shop_name ?? ''),
                'shop_url' => $row->shop_url,
            ]);
            $count = (int) $row->offers_count;
            if ((int) $shop->offers_count !== $count) {
                $shop->offers_count = $count;
                $shop->save();
            }
            $touched++;
        }

        return $touched;
    }
}
