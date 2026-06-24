<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\SellerOneSetting;
use Modules\Catalog\Models\Supplier;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePricingService;
use Modules\Warehouse\Models\Warehouse;

class PriceFormulaSeeder extends Seeder
{
    public function run(): void
    {
        $stored = SellerOneSetting::query()
            ->whereIn('key', [
                SellerOnePricingService::SETTING_PRICE_MARKUP,
                SellerOnePricingService::SETTING_PRICE_RATE,
                SellerOnePricingService::SETTING_PRICE_FIXED_FEE,
                SellerOnePricingService::SETTING_PRICE_PRECISION,
            ])
            ->pluck('value', 'key');

        $multiplier = $stored->get(SellerOnePricingService::SETTING_PRICE_MARKUP) ?? 1.28;
        $rubRate = $stored->get(SellerOnePricingService::SETTING_PRICE_RATE) ?? 3.15;
        $addend = $stored->get(SellerOnePricingService::SETTING_PRICE_FIXED_FEE) ?? 7;
        $precision = $stored->get(SellerOnePricingService::SETTING_PRICE_PRECISION) ?? 1;

        $supplierId = (int) (Supplier::query()->where('code', 'supplier-price-xls')->value('id') ?? 0);
        if ($supplierId > 0) {
            PriceFormula::query()->updateOrCreate(
                [
                    'source_type' => PriceFormula::SOURCE_SUPPLIER,
                    'source_id' => $supplierId,
                    'name' => 'Seller One — основная',
                ],
                [
                    'multiplier' => $multiplier,
                    'rub_rate' => $rubRate,
                    'addend' => $addend,
                    'round_precision' => $precision,
                    'variant_rule_mode' => PriceFormula::MODE_APPLY_TO_ALL,
                    'variant_rules' => null,
                    'is_active' => true,
                    'sort_order' => 100,
                ],
            );
        }

        $mainWarehouseId = (int) (Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id') ?? 0);
        if ($mainWarehouseId > 0) {
            PriceFormula::query()->updateOrCreate(
                [
                    'source_type' => PriceFormula::SOURCE_WAREHOUSE,
                    'source_id' => $mainWarehouseId,
                    'name' => 'Склад — основная',
                ],
                [
                    'multiplier' => $multiplier,
                    'rub_rate' => $rubRate,
                    'addend' => $addend,
                    'round_precision' => $precision,
                    'variant_rule_mode' => PriceFormula::MODE_APPLY_TO_ALL,
                    'variant_rules' => null,
                    'is_active' => true,
                    'sort_order' => 100,
                ],
            );

            PriceFormula::query()->updateOrCreate(
                [
                    'source_type' => PriceFormula::SOURCE_WAREHOUSE,
                    'source_id' => $mainWarehouseId,
                    'name' => 'Склад — пропуск акций',
                ],
                [
                    'multiplier' => $multiplier,
                    'rub_rate' => $rubRate,
                    'addend' => $addend,
                    'round_precision' => $precision,
                    'variant_rule_mode' => PriceFormula::MODE_SKIP_WHEN_MATCH,
                    'variant_rules' => [
                        ['field' => 'is_promotion', 'op' => 'eq', 'value' => true],
                    ],
                    'is_active' => true,
                    'sort_order' => 10,
                ],
            );
        }
    }
}
