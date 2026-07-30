<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SellerOneSetting;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Services\Pricing\BynRateService;
use Modules\Catalog\Services\Pricing\PriceFormulaCalculator;
use Modules\Catalog\Services\Pricing\PriceFormulaResolver;

class SellerOnePricingService
{
    private const DEFAULT_PRICE_MARKUP = 1.28;
    private const DEFAULT_PRICE_RATE = 3.15;
    private const DEFAULT_PRICE_FIXED_FEE = 7.0;
    private const DEFAULTL_PRECISION = 1;
    public const SETTING_PRICE_MARKUP = 'seller_one.price_markup';
    public const SETTING_PRICE_RATE = BynRateService::SETTING_KEY;
    public const SETTING_PRICE_FIXED_FEE = 'seller_one.price_fixed_fee';
    public const SETTING_PRICE_PRECISION = 'seller_one.price_precision';

    public function __construct(
        private readonly PriceFormulaResolver $formulaResolver,
        private readonly PriceFormulaCalculator $calculator,
        private readonly BynRateService $bynRate,
    ) {
    }

    public function getSettings(): array
    {
        $keys = [
            self::SETTING_PRICE_MARKUP,
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
            'price_rate' => $this->bynRate->get(),
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
            self::SETTING_PRICE_FIXED_FEE => (string) $settings['price_fixed_fee'],
            self::SETTING_PRICE_PRECISION => (string) ($settings['price_precision'] ?? $settings['price_final_precision'] ?? ''),
        ];

        foreach ($map as $key => $value) {
            SellerOneSetting::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $value]
            );
        }

        $this->bynRate->update((float) $settings['price_rate']);

        return $this->getSettings();
    }

    public function calculateRetailPrice(float $supplierPrice, ?ProductVariantLink $variant = null, ?int $supplierId = null): float
    {
        if ($variant instanceof ProductVariantLink && $supplierId !== null && $supplierId > 0) {
            $resolved = $this->formulaResolver->calculateRetailPrice(
                $variant,
                $supplierPrice,
                PriceFormula::SOURCE_SUPPLIER,
                $supplierId,
            );
            if ($resolved !== null) {
                return $resolved;
            }
        }

        $settings = $this->getSettings();

        return $this->calculator->calculateFromScalars(
            $supplierPrice,
            (float) $settings['price_markup'],
            (float) $settings['price_rate'],
            (float) $settings['price_fixed_fee'],
            (int) $settings['price_precision'],
        );
    }

    public function calculateRetailPriceForWarehouse(ProductVariantLink $variant, int $warehouseId, float $purchasePrice): float
    {
        $resolved = $this->formulaResolver->calculateRetailPrice(
            $variant,
            $purchasePrice,
            PriceFormula::SOURCE_WAREHOUSE,
            $warehouseId,
        );
        if ($resolved !== null) {
            return $resolved;
        }

        // skip_when_match (напр. акция) — не подменять формулой поставщика.
        if ($this->formulaResolver->shouldSkipVariantPrice(
            $variant,
            PriceFormula::SOURCE_WAREHOUSE,
            $warehouseId,
        )) {
            if ($variant->price !== null) {
                return (float) $variant->price;
            }
        }

        return $this->calculateRetailPrice($purchasePrice);
    }

    public function resolveDefaultSupplierId(): int
    {
        return (int) (Supplier::query()->where('code', 'supplier-price-xls')->value('id') ?? 0);
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
