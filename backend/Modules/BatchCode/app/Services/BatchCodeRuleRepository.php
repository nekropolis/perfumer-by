<?php

namespace Modules\BatchCode\Services;

use RuntimeException;

class BatchCodeRuleRepository
{
    private const STATUSES = [
        'approximate',
        'format_recognized',
        'manufacturer_portal',
        'not_supported',
    ];

    /** @var list<array<string, mixed>>|null */
    private ?array $rules = null;

    /**
     * @return list<array<string, mixed>>
     */
    public function all(): array
    {
        if ($this->rules !== null) {
            return $this->rules;
        }

        $dir = dirname(__DIR__, 2).'/rules';
        $files = glob($dir.'/*.json');
        if ($files === false || $files === []) {
            throw new RuntimeException('Batch-code rules directory is empty.');
        }
        sort($files);

        $rules = [];
        $ids = [];
        $brands = [];
        foreach ($files as $file) {
            $rule = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($rule)) {
                throw new RuntimeException('Batch-code rule is not an object: '.$file);
            }
            $this->assertRule($rule, $file);
            if (isset($ids[$rule['id']])) {
                throw new RuntimeException('Duplicate batch-code rule id: '.$rule['id']);
            }
            $ids[$rule['id']] = true;
            foreach ($rule['brands'] as $slug) {
                if (isset($brands[$slug])) {
                    throw new RuntimeException('Brand slug is in more than one batch-code rule: '.$slug);
                }
                $brands[$slug] = true;
            }
            $rules[] = $rule;
        }

        $this->rules = $rules;

        return $this->rules;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function forBrand(string $slug): ?array
    {
        foreach ($this->all() as $rule) {
            if (in_array($slug, $rule['brands'], true)) {
                return $rule;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $rule
     */
    private function assertRule(array $rule, string $file): void
    {
        foreach (['id', 'brands', 'status', 'regex', 'decoder', 'sources', 'notes', 'period_note'] as $key) {
            if (! array_key_exists($key, $rule)) {
                throw new RuntimeException("Batch-code rule {$file} is missing {$key}.");
            }
        }

        $id = $rule['id'];
        if (! is_string($id) || $id === '') {
            throw new RuntimeException('Batch-code rule id is empty: '.$file);
        }
        if (! is_array($rule['brands']) || $rule['brands'] === []) {
            throw new RuntimeException("Batch-code rule {$id} has no brands.");
        }
        if (! in_array($rule['status'], self::STATUSES, true)) {
            throw new RuntimeException("Batch-code rule {$id} has status {$rule['status']}.");
        }
        if (! is_string($rule['regex']) || @preg_match('~'.$rule['regex'].'~', '') === false) {
            throw new RuntimeException("Batch-code rule {$id} has an invalid regex.");
        }
        if (! is_array($rule['sources']) || $rule['sources'] === []) {
            throw new RuntimeException("Batch-code rule {$id} lacks sources.");
        }
        foreach ($rule['sources'] as $url) {
            if (! is_string($url) || ! str_starts_with($url, 'https://')) {
                throw new RuntimeException("Batch-code rule {$id} has a source that is not an https URL.");
            }
        }
        if (! is_string($rule['notes']) || $rule['notes'] === '' || ! is_string($rule['period_note']) || $rule['period_note'] === '') {
            throw new RuntimeException("Batch-code rule {$id} needs notes and a period note.");
        }

        $decoder = $rule['decoder'];
        if (! is_array($decoder) || ! is_string($decoder['type'] ?? null) || ! is_array($decoder['params'] ?? null)) {
            throw new RuntimeException("Batch-code rule {$id} has an invalid decoder.");
        }
        if (! in_array($decoder['type'], BatchCodeDecoder::TYPES, true)) {
            throw new RuntimeException("Batch-code rule {$id} has decoder {$decoder['type']}.");
        }

        $confidence = $rule['confidence'] ?? null;
        if (in_array($rule['status'], ['approximate', 'format_recognized'], true) && ! in_array($confidence, ['low', 'medium'], true)) {
            throw new RuntimeException("Batch-code rule {$id} needs confidence low or medium.");
        }
        if ($rule['status'] === 'manufacturer_portal') {
            $url = $rule['official_url'] ?? null;
            if (! is_string($url) || ! str_starts_with($url, 'https://')) {
                throw new RuntimeException("Batch-code rule {$id} needs an https portal URL.");
            }
            if ($confidence !== null) {
                throw new RuntimeException("Batch-code rule {$id} must not set a date confidence.");
            }
        }
    }
}
