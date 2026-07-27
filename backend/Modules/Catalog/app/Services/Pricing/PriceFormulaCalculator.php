<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\PriceFormula;

final class PriceFormulaCalculator
{
    public function __construct(
        private readonly BynRateService $bynRate,
    ) {
    }

    public function calculate(PriceFormula $formula, float $purchasePrice): float
    {
        $multiplier = (float) $formula->multiplier;
        $rubRate = $this->bynRate->get();
        $addend = (float) $formula->addend;
        $precision = (int) $formula->round_precision;

        return round(($purchasePrice * $multiplier + $addend) * $rubRate, $precision);
    }

    public function calculateFromScalars(
        float $purchasePrice,
        float $multiplier,
        float $rubRate,
        float $addend,
        int $precision,
    ): float {
        return round(($purchasePrice * $multiplier + $addend) * $rubRate, $precision);
    }
}
