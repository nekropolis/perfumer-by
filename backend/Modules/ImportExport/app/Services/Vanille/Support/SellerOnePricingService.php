<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Modules\Catalog\Models\SellerOneSetting;

class SellerOnePricingService
{
    private const DEFAULT_PRICE_MARKUP = 1.28;
    private const DEFAULT_PRICE_RATE = 3.15;
    private const DEFAULT_PRICE_FIXED_FEE = 7.0;
    private const DEFAULTL_PRECISION = 1;
    public const SETTING_PRICE_MARKUP = 'seller_one.price_markup';
    public const SETTING_PRICE_RATE = 'seller_one.price_rate';
    public const SETTING_PRICE_FIXED_FEE = 'seller_one.price_fixed_fee';
    public const SETTING_PRICE_PRECISION = 'seller_one.price_precision';

    public function getSettings(): array
    {
        $keys = [
            self::SETTING_PRICE_MARKUP,
            self::SETTING_PRICE_RATE,
            self::SETTING_PRICE_FIXED_FEE,
            self::SETTING_PRICE_PRECISION,
        ];

        $stored = SellerOneSetting::query()
            ->whereIn('key', $keys)
            ->pluck('value', 'key');

        return [
            'price_markup' => $this->resolveFloatSetting(
                $stored->get(self::SETTING_PRICE_MARKUP),
                'SELLER_ONE_PRICE_MARKUP',
                self::DEFAULT_PRICE_MARKUP
            ),
            'price_rate' => $this->resolveFloatSetting(
                $stored->get(self::SETTING_PRICE_RATE),
                'SELLER_ONE_PRICE_RATE',
                self::DEFAULT_PRICE_RATE
            ),
            'price_fixed_fee' => $this->resolveFloatSetting(
                $stored->get(self::SETTING_PRICE_FIXED_FEE),
                'SELLER_ONE_PRICE_FIXED_FEE',
                self::DEFAULT_PRICE_FIXED_FEE
            ),
            'price_precision' => $this->resolveIntSetting(
                $stored->get(self::SETTING_PRICE_PRECISION),
                'SELLER_ONE_PRICE_FINAL_PRECISION',
                self::DEFAULTL_PRECISION
            ),
        ];
    }

    public function updateSettings(array $settings): array
    {
        $map = [
            self::SETTING_PRICE_MARKUP => (string) $settings['price_markup'],
            self::SETTING_PRICE_RATE => (string) $settings['price_rate'],
            self::SETTING_PRICE_FIXED_FEE => (string) $settings['price_fixed_fee'],
            self::SETTING_PRICE_PRECISION => (string) $settings['price_final_precision'],
        ];

        foreach ($map as $key => $value) {
            SellerOneSetting::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $value]
            );
        }

        return $this->getSettings();
    }

    public function calculateRetailPrice(float $supplierPrice): float
    {
        $settings = $this->getSettings();
        $markup = (float) $settings['price_markup'];
        $rate = (float) $settings['price_rate'];
        $fixedFee = (float) $settings['price_fixed_fee'];
        $precision = (int) $settings['price_precision'];

        return round(($supplierPrice * $markup + $fixedFee) * $rate, $precision);
    }

    private function resolveFloatSetting(mixed $storedValue, string $envKey, float $default): float
    {
        if ($storedValue !== null && is_numeric((string) $storedValue)) {
            return (float) $storedValue;
        }

        return (float) env($envKey, $default);
    }

    private function resolveIntSetting(mixed $storedValue, string $envKey, int $default): int
    {
        if ($storedValue !== null && is_numeric((string) $storedValue)) {
            return (int) $storedValue;
        }

        return (int) env($envKey, $default);
    }
}
