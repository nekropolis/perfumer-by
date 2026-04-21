<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Illuminate\Support\Str;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;

/**
 * Матчер поставщика Seller One.
 *
 * Правило скоринга (после явного запроса заказчика):
 *   1) имя продукта в каталоге — «строгий префикс» имени у поставщика
 *      (после нормализации и снятия бренда с обеих сторон);
 *   2) diff токенов == 0 (каталог — префикс supplier, длины равны) → base = 80% («exact»);
 *   3) diff токенов == 1 (supplier длиннее ровно на 1 токен)       → base = 70% («partial»);
 *   4) иначе, если набор токенов совпадает как мультимножество и длины равны
 *      (другой порядок слов, напр. «Pour Homme Dylan Blue» vs «Dylan Blue Pour Homme»)
 *      → base = 80% («exact_multiset»), как при полном совпадении по словам;
 *   5) иначе → совпадения нет.
 *
 * Варианты:
 *   • is_tester — ЖЁСТКИЙ фильтр: флаг тестера у поставщика и у варианта
 *     должны строго совпадать. Иначе variant в принципе не может быть
 *     предложен (показываем только `suggested_product`). Это не даёт
 *     случайно «прицепить» обычный item к tester-варианту или наоборот,
 *     когда у продукта в каталоге есть только один тип вариантов.
 *
 *   • БОНУСЫ к базе 80% (exact / exact_multiset, после tester-фильтра):
 *       — совпал объём (±0.01ml)   → +12
 *       — совпала концентрация     → +8
 *     Суммарный score ограничен 100.
 *
 *   • При base 70% («partial») итог всегда 70%: бонусы за объём/концентрацию не
 *     добавляются и suggested_variant не выбирается (чтобы не разгонять до 90%
 *     другой флакон той же линии вроде «… Ispahan» vs «… Ispahan Silver»).
 *
 * Если у подходящего продукта вариантов нет (или ни один не прошёл tester-фильтр) —
 * всё равно возвращаем `suggested_product` с базовыми 80/70%. UI в этом случае
 * показывает кнопку «Создать вариант» (вместо чекбокса «связать»).
 */
class SellerOneVariantMatcher
{
    /** Бонусы варианта (см. doc-блок класса). */
    private const VARIANT_BONUS_VOLUME = 12;
    private const VARIANT_BONUS_CONCENTRATION = 8;

    /**
     * @param  array<int, \Illuminate\Support\Collection<int, \Modules\Catalog\Models\Product>>  $productsIndex
     *         Продукты, сгруппированные по brand_id. Предзагружены `brand` и `variants.definition`.
     */
    public function parseSupplierRow(array $row, $brands, $rules, array $productsIndex): array
    {
        $title = $this->applyTitleRules((string) $row['title'], $rules);
        $hasSkipMarker = str_contains($title, '***');
        $matchedBrand = $this->detectBrand($title, $brands);
        $volume = $this->extractVolume($title);
        $concentration = $this->extractConcentration($title);
        $isTester = $this->extractIsTester($title);
        $productName = $this->extractProductName($title, $matchedBrand['name'] ?? null);

        $match = null;
        if (!$hasSkipMarker) {
            $match = $this->findBestMatch(
                $matchedBrand['id'] ?? null,
                $matchedBrand['name'] ?? null,
                $productName,
                $volume,
                $concentration,
                $isTester,
                $productsIndex,
            );
        }

        $breakdown = $this->makeBreakdown($match);
        $product = $match['product'] ?? null;
        $variant = $match['variant'] ?? null;

        return [
            'code' => (string) $row['code'],
            'title' => $title,
            'supplier_price' => $row['supplier_price'] ?? null,
            'parsed' => [
                'brand' => $matchedBrand['name'] ?? null,
                'product_name' => $productName,
                'volume' => $volume,
                'concentration' => $concentration,
                'is_tester' => $isTester,
                'skip_auto_match' => $hasSkipMarker,
            ],
            'suggested_variant' => $variant ? [
                'id' => $variant->id,
                'product_id' => $variant->product_id,
                'product_name' => $variant->product?->name ?? $product?->name,
                'brand_name' => $variant->product?->brand?->name ?? $product?->brand?->name,
                'display' => $this->buildVariantLabel($variant),
                'confidence' => $breakdown['total'],
                'confidence_breakdown' => $breakdown,
            ] : null,
            // Новое поле: продукт совпал, даже если вариантов у него нет или они не подошли.
            // Консьюмер (UI) сам решает — предложить «Связать вариант» или «Создать вариант».
            'suggested_product' => $product ? [
                'id' => $product->id,
                'name' => $product->name,
                'slug' => $product->slug,
                'brand_name' => $product->brand?->name,
                'confidence' => $breakdown['total'],
                'confidence_breakdown' => $breakdown,
                'has_variant' => $variant !== null,
                'variants_count' => is_countable($product->variants) ? count($product->variants) : 0,
            ] : null,
            'selected_variant_id' => $variant?->id,
        ];
    }

    public function buildVariantLabel(ProductVariantLink $variant): string
    {
        $parts = [];
        if ($variant->volume) {
            $parts[] = "{$variant->volume} {$variant->volume_unit}";
        }
        if ($variant->concentration) {
            $parts[] = Str::upper($variant->concentration);
        }
        if ($variant->edition) {
            $parts[] = $variant->edition;
        }

        return implode(' / ', $parts);
    }

    public function toFloat(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }

        $string = trim((string) $value);
        if ($string === '') {
            return null;
        }

        $string = str_replace([' ', ','], ['', '.'], $string);
        if (!is_numeric($string)) {
            return null;
        }

        return (float) $string;
    }

    /**
     * Основная точка входа: ищет лучший продукт и (опционально) его вариант-бонус.
     *
     * @return array{product: Product, variant: ProductVariantLink|null, base_points: int,
     *               name_level: 'exact'|'exact_multiset'|'partial', name_percent: float, volume_match: bool,
     *               volume_points: int, concentration_match: bool, concentration_points: int,
     *               tester_match: bool, tester_points: int, total: int}|null
     */
    private function findBestMatch(
        ?int $brandId,
        ?string $brandName,
        string $productName,
        ?float $volume,
        ?string $concentration,
        bool $isTester,
        array $productsIndex,
    ): ?array {
        if (!$brandId || $productName === '' || !isset($productsIndex[$brandId])) {
            return null;
        }

        $targetTokens = $this->productNameTokens($productName, $brandName);
        if (empty($targetTokens)) {
            return null;
        }

        $best = null;

        foreach ($productsIndex[$brandId] as $product) {
            $candidateTokens = $this->productNameTokens((string) $product->name, $brandName);
            if (empty($candidateTokens)) {
                continue;
            }

            // 1) Каталог — префикс supplier по порядку; supplier не короче, лишних токенов ≤ 1.
            $diff = count($targetTokens) - count($candidateTokens);
            $prefixOrdered = false;
            if ($diff >= 0 && $diff <= 1) {
                $prefixOrdered = true;
                for ($i = 0, $n = count($candidateTokens); $i < $n; $i++) {
                    if ($candidateTokens[$i] !== $targetTokens[$i]) {
                        $prefixOrdered = false;
                        break;
                    }
                }
            }

            // 2) То же множество токенов, другой порядок (равная длина).
            $multisetExact = !$prefixOrdered
                && count($targetTokens) === count($candidateTokens)
                && $this->tokensMultisetEqual($targetTokens, $candidateTokens);

            if (!$prefixOrdered && !$multisetExact) {
                continue;
            }

            if ($prefixOrdered && $diff === 1) {
                $basePoints = 70;
                $nameLevel = 'partial';
                $namePercent = 70.0;
                $variantBonus = [
                    'variant' => null,
                    'bonus' => 0,
                    'volume_match' => false,
                    'volume_points' => 0,
                    'concentration_match' => false,
                    'concentration_points' => 0,
                    'tester_match' => false,
                    'tester_points' => 0,
                ];
                $total = 70;
            } else {
                $basePoints = 80;
                $nameLevel = $multisetExact ? 'exact_multiset' : 'exact';
                $namePercent = 80.0;
                $variantBonus = $this->findBestVariantBonus($product, $volume, $concentration, $isTester);
                $total = min($basePoints + $variantBonus['bonus'], 100);
            }

            $candidate = [
                'product' => $product,
                'variant' => $variantBonus['variant'],
                'base_points' => $basePoints,
                'name_level' => $nameLevel,
                'name_percent' => $namePercent,
                'volume_match' => $variantBonus['volume_match'],
                'volume_points' => $variantBonus['volume_points'],
                'concentration_match' => $variantBonus['concentration_match'],
                'concentration_points' => $variantBonus['concentration_points'],
                'tester_match' => $variantBonus['tester_match'],
                'tester_points' => $variantBonus['tester_points'],
                'total' => $total,
            ];

            if (
                !$best
                || $total > $best['total']
                || ($total === $best['total'] && $candidate['variant'] && !$best['variant'])
            ) {
                $best = $candidate;
            }
        }

        return $best;
    }

    /**
     * Среди вариантов продукта выбирает тот, у которого максимальный бонус.
     * Возвращает bonus = 0 если вариантов нет или ни один не прошёл tester-фильтр —
     * это нормально, в этом случае мы всё равно показываем продукт (с базовыми 80/70%).
     *
     * tester — ЖЁСТКИЙ фильтр: вариант с is_tester != supplier.is_tester даже не
     * рассматривается как кандидат. Это предотвращает ложные матчи, когда в каталоге
     * есть только tester-вариант (или только обычный), а у поставщика наоборот —
     * раньше variant всё равно «выигрывал» за счёт volume + concentration, хотя
     * tester не совпадал.
     *
     * @return array{variant: ProductVariantLink|null, bonus: int,
     *               volume_match: bool, volume_points: int,
     *               concentration_match: bool, concentration_points: int,
     *               tester_match: bool, tester_points: int}
     */
    private function findBestVariantBonus(
        Product $product,
        ?float $volume,
        ?string $concentration,
        bool $isTester,
    ): array {
        $empty = [
            'variant' => null,
            'bonus' => 0,
            'volume_match' => false,
            'volume_points' => 0,
            'concentration_match' => false,
            'concentration_points' => 0,
            'tester_match' => false,
            'tester_points' => 0,
        ];

        $variants = $product->variants ?? [];
        if (is_countable($variants) && count($variants) === 0) {
            return $empty;
        }

        $best = null;
        foreach ($variants as $variant) {
            // Hard-filter по tester: неподходящие варианты даже не рассматриваются.
            // Без этого matcher мог предложить tester-вариант обычному supplier-item'у
            // (или наоборот), если у продукта других вариантов нет.
            $variantIsTester = (bool) ($variant->definition?->is_tester ?? false);
            if ($variantIsTester !== $isTester) {
                continue;
            }

            $volumeMatch = false;
            $concMatch = false;
            $volumePoints = 0;
            $concPoints = 0;
            $bonus = 0;

            if ($volume !== null && $variant->volume !== null && abs((float) $variant->volume - $volume) <= 0.01) {
                $volumeMatch = true;
                $volumePoints = self::VARIANT_BONUS_VOLUME;
                $bonus += $volumePoints;
            }

            if ($concentration) {
                $variantConc = $this->normalizeConcentration((string) ($variant->concentration ?? ''));
                $targetConc = $this->normalizeConcentration($concentration);
                if ($variantConc !== null && $targetConc !== null && $variantConc === $targetConc) {
                    $concMatch = true;
                    $concPoints = self::VARIANT_BONUS_CONCENTRATION;
                    $bonus += $concPoints;
                }
            }

            $candidate = [
                'variant' => $variant,
                'bonus' => $bonus,
                'volume_match' => $volumeMatch,
                'volume_points' => $volumePoints,
                'concentration_match' => $concMatch,
                'concentration_points' => $concPoints,
                // tester_match всегда true, если кандидат вообще попал сюда (прошёл фильтр).
                'tester_match' => true,
                'tester_points' => 0,
            ];

            if (!$best || $candidate['bonus'] > $best['bonus']) {
                $best = $candidate;
            }
        }

        // Ни volume, ни concentration не совпали — не предлагаем вариант «случайно»,
        // даже если tester-флаг совпал. Админ создаст/выберет нужный вручную.
        if ($best && !$best['volume_match'] && !$best['concentration_match']) {
            $best['variant'] = null;
        }

        return $best ?? $empty;
    }

    /**
     * Нормализованные токены имени продукта без бренда, объёма, концентрации, tester-меток и т. п.
     *
     * @return list<string>
     */
    private function productNameTokens(string $name, ?string $brandName): array
    {
        $normalized = $this->normalizeText($name);
        if ($normalized === '') {
            return [];
        }

        if ($brandName !== null && $brandName !== '') {
            $brandNorm = $this->normalizeText($brandName);
            if ($brandNorm !== '') {
                if ($normalized === $brandNorm) {
                    return [];
                }
                if (Str::startsWith($normalized, $brandNorm . ' ')) {
                    $normalized = trim((string) mb_substr($normalized, mb_strlen($brandNorm)));
                }
            }
        }

        // Снимаем технические токены (объём/концентрация/tester/пол — с обеих сторон симметрично).
        $normalized = (string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', ' ', $normalized);
        $normalized = (string) preg_replace('/\b(edp|edt|edc|parfum|extrait)\b/iu', ' ', $normalized);
        $normalized = (string) preg_replace('/\b(test|tester|тестер|vial|sample|пробник)\b/iu', ' ', $normalized);
        $normalized = (string) preg_replace(
            '/\b(for\s*women|for\s*men|for\s*woman|for\s*man|pour\s*femme|pour\s*homme|women|woman|men|man|femme|homme|unisex)\b/iu',
            ' ',
            $normalized,
        );
        $normalized = preg_replace('/\s+/u', ' ', trim($normalized)) ?: '';

        if ($normalized === '') {
            return [];
        }

        $parts = preg_split('/\s+/u', $normalized) ?: [];

        return array_values(array_filter($parts, static fn (string $t): bool => mb_strlen($t) >= 2));
    }

    /**
     * @param  list<string>  $a
     * @param  list<string>  $b
     */
    private function tokensMultisetEqual(array $a, array $b): bool
    {
        if (count($a) !== count($b)) {
            return false;
        }

        $left = $a;
        $right = $b;
        sort($left, SORT_STRING);
        sort($right, SORT_STRING);

        return $left === $right;
    }

    private function makeBreakdown(?array $match): array
    {
        if (!$match) {
            return [
                'total' => 0,
                'name_percent' => 0,
                'name_points' => 0,
                'name_match_level' => 'none',
                'volume_match' => false,
                'volume_points' => 0,
                'concentration_match' => false,
                'concentration_points' => 0,
                'tester_match' => false,
                'tester_points' => 0,
                'has_variant' => false,
            ];
        }

        return [
            'total' => (int) $match['total'],
            'name_percent' => round((float) $match['name_percent'], 1),
            'name_points' => (int) $match['base_points'],
            'name_match_level' => (string) $match['name_level'],
            'volume_match' => (bool) $match['volume_match'],
            'volume_points' => (int) $match['volume_points'],
            'concentration_match' => (bool) $match['concentration_match'],
            'concentration_points' => (int) $match['concentration_points'],
            'tester_match' => (bool) ($match['tester_match'] ?? false),
            'tester_points' => (int) ($match['tester_points'] ?? 0),
            'has_variant' => $match['variant'] !== null,
        ];
    }

    private function detectBrand(string $title, $brands): ?array
    {
        $normalizedTitle = $this->normalizeText($title);
        $best = null;
        $bestLen = 0;

        foreach ($brands as $brand) {
            $name = trim((string) $brand->name);
            if ($name === '') {
                continue;
            }

            $normalizedBrand = $this->normalizeText($name);
            if ($normalizedBrand === '') {
                continue;
            }

            if (Str::startsWith($normalizedTitle, $normalizedBrand) && Str::length($normalizedBrand) > $bestLen) {
                $best = ['id' => $brand->id, 'name' => $brand->name];
                $bestLen = Str::length($normalizedBrand);
            }
        }

        return $best;
    }

    private function extractProductName(string $title, ?string $brandName): string
    {
        $name = $title;
        $genderMarker = $this->extractGenderMarker($title);

        if ($brandName) {
            $pattern = '/^' . preg_quote($brandName, '/') . '\s+/iu';
            $name = (string) preg_replace($pattern, '', $name, 1);
        }

        $name = (string) preg_replace('/\b(test|tester|тестер)\b/iu', '', $name);
        $name = (string) preg_replace('/\b(vial|пробник|sample)\b/iu', '', $name);
        $name = (string) preg_replace('/\(\s*[a-zа-я]\s*\)/iu', '', $name);
        $name = (string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', '', $name);
        $name = (string) preg_replace('/\b(edp|edt|edc|parfum|extrait)\b/iu', '', $name);
        $name = preg_replace('/\s+/', ' ', trim($name)) ?: '';

        if ($genderMarker === 'l' && $name !== '' && !$this->containsFemaleMarker($name)) {
            $name .= ' for Women';
        }

        return $name;
    }

    private function extractGenderMarker(string $title): ?string
    {
        if (!preg_match('/\(\s*([ml])\s*\)/iu', $title, $matches)) {
            return null;
        }

        return Str::lower((string) ($matches[1] ?? '')) ?: null;
    }

    private function containsFemaleMarker(string $name): bool
    {
        return (bool) preg_match(
            '/\b(for\s*women|women|woman|lady|ladies|pour\s*femme|femme|female|жен(?:ский|ская|ское|щин))\b/iu',
            $name
        );
    }

    private function extractVolume(string $title): ?float
    {
        if (!preg_match('/(\d+(?:[.,]\d+)?)\s*(ml|мл)\b/iu', $title, $matches)) {
            return null;
        }

        return $this->toFloat($matches[1]);
    }

    private function extractConcentration(string $title): ?string
    {
        if (!preg_match('/\b(extrait de parfum|edp|edt|edc|parfum|extrait)\b/iu', $title, $matches)) {
            return null;
        }

        return $this->normalizeConcentration((string) $matches[1]);
    }

    private function extractIsTester(string $title): bool
    {
        return (bool) preg_match('/\b(test|tester|тестер)\b/iu', $title);
    }

    private function normalizeText(string $value): string
    {
        $value = Str::lower($value);
        $value = preg_replace('/[^[:alnum:]\s]+/u', ' ', $value) ?: '';
        $value = preg_replace('/\s+/u', ' ', trim($value)) ?: '';

        return $value;
    }

    private function normalizeConcentration(string $value): ?string
    {
        $normalized = Str::lower(trim($value));
        if ($normalized === '') {
            return null;
        }

        if (str_contains($normalized, 'extrait')) {
            return 'extrait de parfum';
        }

        return match ($normalized) {
            'parfum' => 'extrait de parfum',
            default => $normalized,
        };
    }

    private function applyTitleRules(string $title, $rules): string
    {
        $result = $title;
        foreach ($rules as $rule) {
            $pattern = trim((string) $rule->pattern);
            $replacement = (string) $rule->replacement;
            if ($pattern === '') {
                continue;
            }
            $result = str_ireplace($pattern, $replacement, $result);
        }

        return $result;
    }
}
