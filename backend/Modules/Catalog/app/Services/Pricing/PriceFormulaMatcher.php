<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;

final class PriceFormulaMatcher
{
    /**
     * @param  array<int, array{field: string, op: string, value: bool|int|float|string}>|null  $rules
     */
    public function rulesMatch(ProductVariantLink $variant, ?array $rules): bool
    {
        if ($rules === null || $rules === []) {
            return false;
        }

        $variant->loadMissing('definition');

        foreach ($rules as $rule) {
            if (!is_array($rule)) {
                return false;
            }

            $field = (string) ($rule['field'] ?? '');
            $op = (string) ($rule['op'] ?? 'eq');
            $expected = $rule['value'] ?? null;
            $actual = $this->resolveFieldValue($variant, $field);

            if ($actual === null && $expected !== null) {
                return false;
            }

            $matches = match ($op) {
                'neq' => $actual !== $expected,
                default => $actual === $expected,
            };

            if (!$matches) {
                return false;
            }
        }

        return true;
    }

    public function shouldSkipVariant(ProductVariantLink $variant, PriceFormula $formula): bool
    {
        return match ($formula->variant_rule_mode) {
            PriceFormula::MODE_SKIP_WHEN_MATCH => $this->rulesMatch($variant, $formula->variant_rules),
            default => false,
        };
    }

    public function shouldApplyVariant(ProductVariantLink $variant, PriceFormula $formula): bool
    {
        return match ($formula->variant_rule_mode) {
            PriceFormula::MODE_APPLY_TO_ALL => true,
            PriceFormula::MODE_APPLY_WHEN_MATCH => $this->rulesMatch($variant, $formula->variant_rules),
            PriceFormula::MODE_SKIP_WHEN_MATCH => !$this->rulesMatch($variant, $formula->variant_rules),
        };
    }

    private function resolveFieldValue(ProductVariantLink $variant, string $field): mixed
    {
        return match ($field) {
            'is_promotion' => (bool) $variant->is_promotion,
            'is_preorder' => (bool) $variant->is_preorder,
            'is_tester' => (bool) ($variant->definition?->is_tester ?? false),
            'is_vial' => (bool) ($variant->definition?->is_vial ?? false),
            default => null,
        };
    }
}
