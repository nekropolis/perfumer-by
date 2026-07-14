<?php

namespace Modules\Catalog\Support;

use Modules\Catalog\Models\VariantDefinition;

class VariantDefinitionResolver
{
    private const MINIATURE_MIN_VOLUME_ML = 3.0;

    private const MINIATURE_MAX_VOLUME_ML = 18.0;

    /** @var array<string, string> */
    private const CONCENTRATION_LABELS = [
        'edt' => 'туалетная вода',
        'edc' => 'одеколон',
        'extrait de parfum' => 'духи',
        'edp' => 'парфюмерная вода',
        'parfum' => 'духи',
    ];

    public function resolveOrCreate(
        float $volumeMl,
        string $concentrationCode,
        bool $isTester = false,
        bool $isVial = false,
        bool $isMiniature = false,
    ): ?VariantDefinition {
        if ($isTester && $isVial) {
            return null;
        }

        if ($isVial && $isMiniature) {
            return null;
        }

        $volumeMl = VariantDefinitionVolume::normalize($volumeMl);
        $concentrationCode = mb_strtolower(trim($concentrationCode));
        $concentrationLabel = self::CONCENTRATION_LABELS[$concentrationCode] ?? null;
        if ($concentrationLabel === null) {
            return null;
        }

        if ($isMiniature && ! $this->isValidMiniatureVolume($volumeMl)) {
            return null;
        }

        $sortOrder = ($volumeMl * 10)
            + $this->concentrationSortIndex($concentrationCode)
            + ($isTester ? 1000 : 0)
            + ($isVial ? 2000 : 0)
            + ($isMiniature ? 3000 : 0);

        return VariantDefinition::query()->firstOrCreate(
            [
                'volume_ml' => $volumeMl,
                'concentration_code' => $concentrationCode,
                'is_tester' => $isTester,
                'is_vial' => $isVial,
                'is_miniature' => $isMiniature,
            ],
            [
                'concentration_label' => $concentrationLabel,
                'title' => VariantDefinitionVolume::buildTitle(
                    $volumeMl,
                    $concentrationCode,
                    $concentrationLabel,
                    $isTester,
                    $isVial,
                    $isMiniature,
                ),
                'sort_order' => $sortOrder,
                'excludes_from_free_delivery_threshold' => $isVial,
            ],
        );
    }

    public function isValidMiniatureVolume(float $volumeMl): bool
    {
        $normalized = VariantDefinitionVolume::normalize($volumeMl);
        if ($normalized < self::MINIATURE_MIN_VOLUME_ML || $normalized > self::MINIATURE_MAX_VOLUME_ML) {
            return false;
        }

        $steps = (int) round(($normalized - self::MINIATURE_MIN_VOLUME_ML) * 10);

        return abs($normalized - (self::MINIATURE_MIN_VOLUME_ML + ($steps * 0.1))) < 0.001;
    }

    private function concentrationSortIndex(string $concentrationCode): int
    {
        $index = array_search($concentrationCode, array_keys(self::CONCENTRATION_LABELS), true);

        return $index === false ? 0 : (int) $index;
    }
}
