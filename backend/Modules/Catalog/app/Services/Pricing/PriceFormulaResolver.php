<?php

namespace Modules\Catalog\Services\Pricing;

use Illuminate\Support\Collection;
use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;

final class PriceFormulaResolver
{
    public function __construct(
        private readonly PriceFormulaMatcher $matcher,
        private readonly PriceFormulaCalculator $calculator,
    ) {
    }

    /**
     * @return Collection<int, PriceFormula>
     */
    public function activeFormulasForSource(string $sourceType, int $sourceId): Collection
    {
        return PriceFormula::query()
            ->where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    public function resolveForVariant(
        ProductVariantLink $variant,
        string $sourceType,
        int $sourceId,
    ): ?PriceFormula {
        $formulas = $this->activeFormulasForSource($sourceType, $sourceId);
        if ($formulas->isEmpty()) {
            return null;
        }

        foreach ($formulas as $formula) {
            if ($formula->variant_rule_mode === PriceFormula::MODE_SKIP_WHEN_MATCH) {
                if ($this->matcher->rulesMatch($variant, $formula->variant_rules)) {
                    return null;
                }

                continue;
            }

            if ($formula->variant_rule_mode === PriceFormula::MODE_APPLY_WHEN_MATCH) {
                if ($this->matcher->rulesMatch($variant, $formula->variant_rules)) {
                    return $formula;
                }

                continue;
            }
        }

        return $formulas->first(
            static fn (PriceFormula $formula): bool => $formula->variant_rule_mode === PriceFormula::MODE_APPLY_TO_ALL,
        );
    }

    public function shouldSkipVariantPrice(
        ProductVariantLink $variant,
        string $sourceType,
        int $sourceId,
    ): bool {
        return $this->resolveForVariant($variant, $sourceType, $sourceId) === null
            && $this->hasSkipRuleMatch($variant, $sourceType, $sourceId);
    }

    public function calculateRetailPrice(
        ProductVariantLink $variant,
        float $purchasePrice,
        string $sourceType,
        int $sourceId,
    ): ?float {
        $formula = $this->resolveForVariant($variant, $sourceType, $sourceId);
        if (!$formula instanceof PriceFormula) {
            return null;
        }

        return $this->calculator->calculate($formula, $purchasePrice);
    }

    private function hasSkipRuleMatch(
        ProductVariantLink $variant,
        string $sourceType,
        int $sourceId,
    ): bool {
        foreach ($this->activeFormulasForSource($sourceType, $sourceId) as $formula) {
            if ($formula->variant_rule_mode === PriceFormula::MODE_SKIP_WHEN_MATCH
                && $this->matcher->rulesMatch($variant, $formula->variant_rules)) {
                return true;
            }
        }

        return false;
    }
}
