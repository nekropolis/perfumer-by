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

        $volume = $this->extractVolumeMl($variant);
        if ($volume === null) {
            $volume = $this->extractVolumeMl($fullText);
        }

        $isTester = str_contains($fullText, 'тестер') || str_contains($fullText, 'tester');

        $concentration = $this->resolveConcentrationCode($fullText);

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

    private function extractVolumeMl(string $text): ?int
    {
        if (!preg_match('/(\d+(?:[.,]\d+)?)\s*(мл|ml)\b/iu', $text, $match)) {
            return null;
        }

        return (int) round((float) str_replace(',', '.', $match[1]));
    }

    private function resolveConcentrationCode(string $fullText): ?string
    {
        if (str_contains($fullText, 'extrait de parfum') || preg_match('/\bextrait\b/u', $fullText)) {
            return 'extrait de parfum';
        }

        if (str_contains($fullText, 'парфюмерная вода') || str_contains($fullText, 'eau de parfum')) {
            return 'edp';
        }

        if (str_contains($fullText, 'туалетная вода') || str_contains($fullText, 'eau de toilette')) {
            return 'edt';
        }

        if (str_contains($fullText, 'одеколон') || str_contains($fullText, 'eau de cologne')) {
            return 'edc';
        }

        if (preg_match('/\b(edp|edt|edc)\b/u', $fullText, $abbrev)) {
            return mb_strtolower($abbrev[1]);
        }

        if (str_contains($fullText, 'духи') && !str_contains($fullText, 'туалет')) {
            return 'extrait de parfum';
        }

        return null;
    }
}
