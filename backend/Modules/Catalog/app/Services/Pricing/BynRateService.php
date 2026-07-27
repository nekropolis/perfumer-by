<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\SellerOneSetting;

final class BynRateService
{
    public const SETTING_KEY = 'seller_one.price_rate';

    public const DEFAULT_RATE = 3.15;

    public function get(): float
    {
        $stored = SellerOneSetting::query()
            ->where('key', self::SETTING_KEY)
            ->value('value');

        if ($stored !== null && is_numeric((string) $stored)) {
            return (float) $stored;
        }

        return (float) env('SELLER_ONE_PRICE_RATE', self::DEFAULT_RATE);
    }

    public function update(float $rate): float
    {
        $normalized = number_format(max(0, $rate), 4, '.', '');

        SellerOneSetting::query()->updateOrCreate(
            ['key' => self::SETTING_KEY],
            ['value' => $normalized],
        );

        PriceFormula::query()->update([
            'rub_rate' => $normalized,
        ]);

        return $this->get();
    }
}
