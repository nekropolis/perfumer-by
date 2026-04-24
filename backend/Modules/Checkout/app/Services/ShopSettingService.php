<?php

namespace Modules\Checkout\Services;

use Modules\Checkout\Models\ShopSetting;

class ShopSettingService
{
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
     * @return array<string, string|null>
     */
    public function allMap(): array
    {
        if ($this->cache !== null) {
            return $this->cache;
        }

        $this->cache = ShopSetting::query()
            ->pluck('value', 'key')
            ->all();

        return $this->cache;
    }

    public function forgetCache(): void
    {
        $this->cache = null;
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
