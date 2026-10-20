<?php

namespace Tests\Unit;

use Modules\BatchCode\Services\BatchCodeRuleRepository;
use Modules\BatchCode\Support\BatchCodeNormalizer;
use Tests\TestCase;

class BatchCodeRulesTest extends TestCase
{
    public function test_rules_are_unverified_and_cite_sources(): void
    {
        $files = glob(base_path('Modules/BatchCode/rules/*.json'));
        $this->assertNotEmpty($files);

        foreach ($files as $file) {
            $rule = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            $this->assertIsArray($rule, $file);
            $this->assertNotSame('verified', $rule['status'] ?? null, $file);
            $this->assertContains(
                $rule['status'] ?? null,
                ['approximate', 'format_recognized', 'manufacturer_portal', 'not_supported'],
                $file,
            );
            $this->assertIsArray($rule['sources'] ?? null, $file);
            $this->assertNotEmpty($rule['sources'], $file);
            foreach ($rule['sources'] as $url) {
                $this->assertMatchesRegularExpression('#^https://#', (string) $url, $file);
            }
            $this->assertStringNotContainsString('оригинал', mb_strtolower((string) ($rule['period_note'] ?? '')));
            $this->assertStringNotContainsString('поддел', mb_strtolower((string) ($rule['period_note'] ?? '')));
            $this->assertStringNotContainsString('официальн', mb_strtolower((string) ($rule['period_note'] ?? '')));
        }

        $rules = app(BatchCodeRuleRepository::class)->all();
        $this->assertCount(count($files), $rules);
        $this->assertNotContains('verified', array_column($rules, 'status'));
    }

    public function test_normalizer_folds_cyrillic_lookalikes_and_separators(): void
    {
        $this->assertSame('0T02', BatchCodeNormalizer::normalize('0т-02'));
        $this->assertSame('AB12', BatchCodeNormalizer::normalize(' ав 12 '));
        $this->assertSame('0O02', BatchCodeNormalizer::normalize('0O02'));
    }
}
