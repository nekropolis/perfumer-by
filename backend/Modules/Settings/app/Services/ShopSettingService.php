<?php

namespace Modules\Settings\Services;

use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Support\CatalogProductQueryFilters;
use Modules\Settings\Models\ShopSetting;
use Modules\Settings\Support\WaitingDiscountDeliveryDate;

class ShopSettingService
{
    public const HOME_POPULAR_BRAND_IDS_KEY = 'home_popular_brand_ids';

    public const SEARCH_POPULAR_BRAND_IDS_KEY = 'search_popular_brand_ids';

    public const HOME_POPULAR_BRANDS_MAX = 5;

    public const SEARCH_POPULAR_BRANDS_MAX = 8;

    private const PUBLIC_SETTINGS_CACHE_KEY = 'settings:shop-settings:all-map';

    private const PUBLIC_SETTINGS_CACHE_TTL_SECONDS = 300;

    /** @var array<string, string|null>|null */
    private ?array $cache = null;

    public function get(string $key, ?string $default = null): ?string
    {
        $map = $this->allMap();

        return array_key_exists($key, $map) && $map[$key] !== null && $map[$key] !== ''
            ? (string) $map[$key]
            : $default;
    }

    public function getDecimal(string $key, float $default): float
    {
        $raw = $this->get($key);
        if ($raw === null || $raw === '') {
            return $default;
        }

        return round((float) str_replace(',', '.', $raw), 2);
    }

    public function getInt(string $key, int $default): int
    {
        $raw = $this->get($key);
        if ($raw === null || $raw === '') {
            return $default;
        }

        return (int) $raw;
    }

    /**
     * Публичные настройки доставки для витрины/checkout.
     *
     * @return array{
     *   delivery_minsk_free_threshold: float,
     *   delivery_minsk_fee: float,
     *   delivery_belarus_fee: float,
     *   delivery_belarus_free_min_lines: int
     * }
     */
    public function publicCheckoutSettings(): array
    {
        return [
            'delivery_minsk_free_threshold' => $this->getDecimal('delivery_minsk_free_threshold', 50),
            'delivery_minsk_fee' => $this->getDecimal('delivery_minsk_fee', 3),
            'delivery_belarus_fee' => $this->getDecimal('delivery_belarus_fee', 6),
            'delivery_belarus_free_min_lines' => $this->getInt('delivery_belarus_free_min_lines', 2),
        ];
    }

    /**
     * Доставка + контакты для витрины (шапка, /site/content).
     *
     * @return array<string, float|int|string|list<array{id: int, name: string, slug: string}>>
     */
    public function publicSiteContent(): array
    {
        return array_merge($this->publicCheckoutSettings(), [
            'contact_phone_mts' => (string) $this->get('contact_phone_mts', '+375336408833'),
            'contact_phone_a1' => (string) $this->get('contact_phone_a1', '+375296408833'),
            'contact_phone_life' => (string) $this->get('contact_phone_life', '+375256408833'),
            'contact_email' => (string) $this->get('contact_email', 'admin@perfumer.by'),
            'legal_name' => (string) $this->get('legal_name', 'ИП Гришкевич П.А.'),
            'legal_unp' => (string) $this->get('legal_unp', '191168408'),
            'legal_address' => (string) $this->get('legal_address', ''),
            'contact_telegram_url' => (string) $this->get('contact_telegram_url', 'https://t.me/perfumer_support'),
            'contact_viber_url' => (string) $this->get('contact_viber_url', 'viber://chat?number=%2B375296408833'),
            'waiting_discount_delivery_date' => (string) $this->get(
                WaitingDiscountDeliveryDate::SETTING_KEY,
                WaitingDiscountDeliveryDate::DEFAULT
            ),
            'home_popular_brands' => $this->homePopularBrands(),
            'search_popular_brands' => $this->searchPopularBrands(),
        ]);
    }

    /**
     * @return list<int>
     */
    public function homePopularBrandIds(): array
    {
        return $this->brandIdsFromSetting(self::HOME_POPULAR_BRAND_IDS_KEY, self::HOME_POPULAR_BRANDS_MAX);
    }

    /**
     * @return list<array{id: int, name: string, slug: string}>
     */
    public function homePopularBrands(): array
    {
        return $this->resolveActiveBrands($this->homePopularBrandIds());
    }

    /**
     * @return list<int>
     */
    public function searchPopularBrandIds(): array
    {
        return $this->brandIdsFromSetting(self::SEARCH_POPULAR_BRAND_IDS_KEY, self::SEARCH_POPULAR_BRANDS_MAX);
    }

    /**
     * @return list<array{id: int, name: string, slug: string}>
     */
    public function searchPopularBrands(): array
    {
        return $this->resolveActiveBrands($this->searchPopularBrandIds());
    }

    /**
     * @return list<int>
     */
    private function brandIdsFromSetting(string $key, int $max): array
    {
        $raw = $this->get($key, '[]');
        $decoded = json_decode((string) $raw, true);
        if (! is_array($decoded)) {
            return [];
        }

        $ids = [];
        foreach ($decoded as $value) {
            $id = (int) $value;
            if ($id > 0 && ! in_array($id, $ids, true)) {
                $ids[] = $id;
            }
            if (count($ids) >= $max) {
                break;
            }
        }

        return $ids;
    }

    /**
     * @param  list<int>  $ids
     * @return list<array{id: int, name: string, slug: string}>
     */
    private function resolveActiveBrands(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $byId = Brand::query()
            ->whereIn('id', $ids)
            ->where('is_active', true);
        CatalogProductQueryFilters::applyStorefrontBrandVisibilityFilter($byId);
        $byId = $byId
            ->get(['id', 'name', 'slug'])
            ->keyBy('id');

        $result = [];
        foreach ($ids as $id) {
            $brand = $byId->get($id);
            if ($brand === null) {
                continue;
            }
            $result[] = [
                'id' => (int) $brand->id,
                'name' => (string) $brand->name,
                'slug' => (string) $brand->slug,
            ];
        }

        return $result;
    }

    /**
     * Если дата отправки под заказ (скидка 3%) уже в прошлом — сдвигает на сегодня + 7 дней.
     *
     * @return array{from: string, to: string}|null null — дата актуальна, изменений нет
     */
    public function advanceWaitingDiscountDeliveryDateIfPast(?CarbonInterface $now = null): ?array
    {
        $current = (string) $this->get(
            WaitingDiscountDeliveryDate::SETTING_KEY,
            WaitingDiscountDeliveryDate::DEFAULT
        );

        $change = WaitingDiscountDeliveryDate::nextIfPast($current, $now);
        if ($change === null) {
            return null;
        }

        $this->setMany([
            WaitingDiscountDeliveryDate::SETTING_KEY => $change['to'],
        ]);

        return $change;
    }

    /**
     * @return array<string, string|null>
     */
    public function allMap(): array
    {
        if ($this->cache !== null) {
            return $this->cache;
        }

        $this->cache = Cache::remember(
            self::PUBLIC_SETTINGS_CACHE_KEY,
            self::PUBLIC_SETTINGS_CACHE_TTL_SECONDS,
            static fn (): array => ShopSetting::query()
                ->pluck('value', 'key')
                ->all()
        );

        return $this->cache;
    }

    public function forgetCache(): void
    {
        $this->cache = null;
        Cache::forget(self::PUBLIC_SETTINGS_CACHE_KEY);
        Cache::forget('checkout:shop-settings:all-map');
    }

    /**
     * @param  array<string, string|int|float|bool>  $values
     */
    public function setMany(array $values): void
    {
        foreach ($values as $key => $value) {
            ShopSetting::query()->updateOrCreate(
                ['key' => (string) $key],
                ['value' => (string) $value]
            );
        }

        $this->forgetCache();
    }
}
