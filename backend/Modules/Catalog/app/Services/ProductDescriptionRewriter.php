<?php

namespace Modules\Catalog\Services;

use App\Services\Llm\LlmClientFactory;
use Modules\Catalog\Models\Product;
use Modules\ImportExport\Support\LegacyProductDetector;

class ProductDescriptionRewriter
{
    public function __construct(
        private readonly LlmClientFactory $llmFactory,
        private readonly LegacyProductDetector $legacyDetector,
    ) {
    }

    /**
     * @return array{ok: bool, description?: string, error?: string}
     */
    public function rewriteProduct(Product $product): array
    {
        if ($this->legacyDetector->isLegacy((int) $product->id)) {
            return ['ok' => false, 'error' => 'legacy_skip'];
        }

        $source = trim((string) $product->description);
        $minLen = (int) config('llm.description.min_source_length', 80);
        if (mb_strlen($source) < $minLen) {
            return ['ok' => false, 'error' => 'source_too_short'];
        }

        $product->loadMissing(['brand', 'attributeValues.productAttribute', 'attributeValues.selectedOptions.productAttributeOption']);

        $system = $this->buildSystemPrompt();
        $user = $this->buildUserPayload($product, $source);

        try {
            $client = $this->llmFactory->make();
            $raw = $client->complete($system, $user, ['max_tokens' => 8192]);
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => 'llm: '.$e->getMessage()];
        }

        $raw = trim($raw);
        $validation = $this->validateOutput($product, $source, $raw);
        if (! $validation['ok']) {
            return ['ok' => false, 'error' => 'validation: '.$validation['reason']];
        }

        return ['ok' => true, 'description' => $raw];
    }

    private function buildSystemPrompt(): string
    {
        return <<<'PROMPT'
Ты редактор SEO-текстов для интернет-каталога парфюмерии в Беларуси.
Перепиши HTML-описание товара: сделай уникальным по формулировкам, сохрани факты из входных данных (бренд, название, ноты, семейство, концентрация, страна, год, парфюмер). Не выдумывай факты.
Тон: нейтрально-маркетинговый, русский язык. Не используй «мы», «наш магазин».
Органично встрой ключи: «купить», «Минск», «Беларусь», «парфюм», «духи», «туалетная вода» — без переспама.
Запрещено: цены, скидки, акции, наличие, доставка как обещание, другие магазины и домены.
Разрешённые HTML-теги только: <p>, <h2>, <h3>, <ul>, <li>, <strong>. Без markdown, без inline-стилей, без <script>, <img>, <iframe>.
Структура: краткий лид, затем секции с <h2> (например «Описание аромата», «Кому подойдёт», «Ноты», «Где купить»).
Первое предложение первого <p> должно содержать полное название бренда и товара из входных данных.
Верни только итоговый HTML, без пояснений до или после.
PROMPT;
    }

    private function buildUserPayload(Product $product, string $sourceHtml): string
    {
        $brand = $product->brand?->name ?? '';
        $lines = [];
        $lines[] = 'Название товара: '.$product->name;
        if ($brand !== '') {
            $lines[] = 'Бренд: '.$brand;
        }
        $lines[] = 'Флаги: is_new='.($product->is_new ? '1' : '0').', is_hit='.($product->is_hit ? '1' : '0');
        if ($product->seo_title) {
            $lines[] = 'SEO title: '.$product->seo_title;
        }
        if ($product->seo_description) {
            $lines[] = 'SEO description: '.$product->seo_description;
        }
        if ($product->seo_keyword) {
            $lines[] = 'SEO keywords: '.$product->seo_keyword;
        }

        foreach ($product->attributeValues as $av) {
            $attrName = $av->productAttribute?->name ?? '';
            if ($attrName === '') {
                continue;
            }
            $parts = [];
            if ($av->custom_value) {
                $parts[] = trim((string) $av->custom_value);
            }
            foreach ($av->selectedOptions as $so) {
                $n = $so->productAttributeOption?->name ?? '';
                if ($n !== '') {
                    $parts[] = $n;
                }
            }
            if ($parts !== []) {
                $lines[] = $attrName.': '.implode(', ', $parts);
            }
        }

        $lines[] = '';
        $lines[] = 'Исходное описание (HTML):';
        $lines[] = $sourceHtml;

        return implode("\n", $lines);
    }

    /**
     * @return array{ok: bool, reason?: string}
     */
    private function validateOutput(Product $product, string $source, string $html): array
    {
        $minOut = (int) config('llm.description.min_output_length', 700);
        $maxOut = (int) config('llm.description.max_output_length', 1500);
        $len = mb_strlen(strip_tags($html));
        if ($len < $minOut || $len > $maxOut) {
            return ['ok' => false, 'reason' => 'length_out_of_range'];
        }

        if (preg_match('/<(script|iframe|img|style|form|input|button|svg)/iu', $html)) {
            return ['ok' => false, 'reason' => 'forbidden_tag'];
        }

        if (preg_match('/<[\/]?(?!p\b|h2\b|h3\b|ul\b|li\b|strong\b|br\b)[a-z][a-z0-9]*\b/iu', $html)) {
            return ['ok' => false, 'reason' => 'disallowed_tag'];
        }

        $brand = mb_strtolower(trim((string) ($product->brand?->name ?? '')));
        $name = mb_strtolower(trim($product->name));
        $plainStart = mb_strtolower(mb_substr(strip_tags($html), 0, 400));
        if ($brand !== '' && ! str_contains($plainStart, $brand)) {
            return ['ok' => false, 'reason' => 'missing_brand_in_lead'];
        }
        if ($name !== '' && ! str_contains($plainStart, $name)) {
            return ['ok' => false, 'reason' => 'missing_name_in_lead'];
        }

        $j1 = $this->jaccard($source, $html);
        $minJ = (float) config('llm.description.min_jaccard_vs_source', 0.08);
        $maxJ = (float) config('llm.description.max_jaccard_vs_source', 0.72);
        if ($j1 < $minJ || $j1 > $maxJ) {
            return ['ok' => false, 'reason' => 'jaccard_out_of_range:'.$j1];
        }

        return ['ok' => true];
    }

    private function jaccard(string $a, string $b): float
    {
        $ta = array_filter(array_unique(preg_split('/\s+/u', mb_strtolower(strip_tags($a))) ?: []));
        $tb = array_filter(array_unique(preg_split('/\s+/u', mb_strtolower(strip_tags($b))) ?: []));
        if ($ta === [] || $tb === []) {
            return 0.0;
        }
        $sa = array_fill_keys($ta, true);
        $inter = 0;
        foreach ($tb as $w) {
            if (isset($sa[$w])) {
                $inter++;
            }
        }
        $union = count($ta) + count($tb) - $inter;

        return $union > 0 ? $inter / $union : 0.0;
    }
}
