<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

use Modules\Catalog\Models\VariantDefinition;
use Modules\ImportExport\Support\VanilleHelper;

class VanilleOfferVariantParser
{
    public function parseVariant(array $offer): array
    {
        $variant = (string) ($offer['variant'] ?? '');
        $title = (string) ($offer['title'] ?? '');
        $type = (string) ($offer['type'] ?? '');
        $fullText = mb_strtolower(trim("{$variant} {$title} {$type}"));

        $volume = null;
        if (preg_match('/(\d+)\s*(мл|ml)/iu', $variant, $m)) {
            $volume = (int) $m[1];
        }

        $isTester = str_contains($fullText, 'тестер') || str_contains($fullText, 'tester');

        $concentration = null;
        if (str_contains($fullText, 'extrait de parfum') || str_contains($fullText, ' extrait')) {
            $concentration = 'extrait de parfum';
        } elseif (str_contains($fullText, ' edc')) {
            $concentration = 'edc';
        } elseif (str_contains($fullText, ' edp')) {
            $concentration = 'edp';
        } elseif (str_contains($fullText, ' edt')) {
            $concentration = 'edt';
        }

        return [
            'volume_ml' => $volume,
            'concentration_code' => $concentration,
            'is_tester' => $isTester,
        ];
    }

    public function resolveVariantDefinition(array $parsed): ?VariantDefinition
    {
        $volume = isset($parsed['volume_ml']) ? (int) $parsed['volume_ml'] : null;
        $concentrationCode = isset($parsed['concentration_code'])
            ? VanilleHelper::normalizeNullableString((string) $parsed['concentration_code'])
            : null;
        $isTester = (bool) ($parsed['is_tester'] ?? false);

        if (!$volume || !$concentrationCode) {
            return null;
        }

        $labels = [
            'edt' => 'туалетная вода',
            'edp' => 'парфюмерная вода',
            'edc' => 'одеколон',
            'extrait de parfum' => 'духи',
        ];
        $label = $labels[$concentrationCode] ?? $concentrationCode;
        $title = sprintf(
            '%d мл / %s - %s%s',
            $volume,
            strtoupper($concentrationCode),
            $label,
            $isTester ? ' / Тестер' : ''
        );

        return VariantDefinition::query()->firstOrCreate(
            [
                'volume_ml' => $volume,
                'concentration_code' => $concentrationCode,
                'is_tester' => $isTester,
            ],
            [
                'concentration_label' => $label,
                'title' => $title,
                'sort_order' => 0,
            ]
        );
    }
}
