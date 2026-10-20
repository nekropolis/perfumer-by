<?php

namespace Modules\BatchCode\Services;

use Modules\BatchCode\Support\BatchCodeNormalizer;
use Modules\Catalog\Models\Brand;

class BatchCodeChecker
{
    public function __construct(
        private readonly BatchCodeRuleRepository $rules,
        private readonly BatchCodeDecoder $decoder,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function check(Brand $brand, string $rawCode): array
    {
        $normalized = BatchCodeNormalizer::normalize($rawCode);
        $rule = $this->rules->forBrand($brand->slug);

        if ($rule === null) {
            return $this->payload('not_supported', $brand, $normalized);
        }

        if ($normalized === '' || preg_match('~'.$rule['regex'].'~', $normalized) !== 1) {
            return $this->payload(
                'invalid_format',
                $brand,
                $normalized,
                ruleId: $rule['id'],
                sources: $rule['sources'],
            );
        }

        $decoded = $this->decoder->decode($normalized, $rule);
        $status = $decoded['status'];

        return $this->payload(
            $status,
            $brand,
            $normalized,
            result: $decoded['result'],
            confidence: $this->confidenceFor($status, $rule),
            periodNote: $this->noteFor($status, $rule),
            officialUrl: $status === 'manufacturer_portal' ? ($rule['official_url'] ?? null) : null,
            ruleId: $rule['id'],
            sources: $rule['sources'],
        );
    }

    /**
     * @param  array<string, mixed>  $rule
     */
    private function confidenceFor(string $status, array $rule): ?string
    {
        if ($status === 'approximate') {
            return $rule['confidence'];
        }
        if ($status === 'format_recognized' && $rule['status'] === 'format_recognized') {
            return $rule['confidence'];
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $rule
     */
    private function noteFor(string $status, array $rule): ?string
    {
        if (! in_array($status, ['approximate', 'format_recognized', 'manufacturer_portal'], true)) {
            return null;
        }

        return $rule['period_note'] ?? null;
    }

    /**
     * @param  array<string, mixed>|null  $result
     * @param  list<string>  $sources
     * @return array<string, mixed>
     */
    private function payload(
        string $status,
        Brand $brand,
        string $normalized,
        ?array $result = null,
        ?string $confidence = null,
        ?string $periodNote = null,
        ?string $officialUrl = null,
        ?string $ruleId = null,
        array $sources = [],
    ): array {
        return [
            'status' => $status,
            'brand' => [
                'slug' => $brand->slug,
                'name' => $brand->name,
            ],
            'code_normalized' => $normalized,
            'result' => $result,
            'confidence' => $confidence,
            'period_note' => $periodNote,
            'official_url' => $officialUrl,
            'rule_id' => $ruleId,
            'sources' => array_values($sources),
        ];
    }
}
