<?php

namespace Modules\Checkout\Services;

use Illuminate\Support\Facades\Cache;
use Modules\Checkout\Models\ShopSetting;

class ShopSettingService
{
    private const PUBLIC_SETTINGS_CACHE_KEY = 'checkout:shop-settings:all-map';
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
