<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogProductLinkNameTokenizer;
use Modules\Catalog\Support\ProductDisplayName;

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

    /** product_attributes: «Для кого» */
    public const GENDER_ATTRIBUTE_ID = 3;

    /**
     * Кэши hot-path'а: при 25k+ строк прайса normalizeText по каждому бренду и
     * токенизация имён продуктов на каждую строку — основной расход CPU парсинга.
     * Имена брендов/продуктов в рамках одного прогона не меняются.
     */

    /** @var array<int, string> brand_id => нормализованное имя */
    private array $brandNormalizedCache = [];

    /** @var array<int, list<string>> product_id => токены имени */
    private array $productTokensCache = [];

    /** product_attribute_options */
    private const GENDER_OPTION_FEMALE_ID = 3;

    private const GENDER_OPTION_MALE_ID = 35;

    private const GENDER_OPTION_UNISEX_ID = 438;

    /**
     * @param  Collection<int, Brand>  $brands
     * @param  Collection<int, SellerOneMatchRule>  $rules
     * @param  array<int, \Illuminate\Support\Collection<int, \Modules\Catalog\Models\Product>>  $productsIndex
     *         Продукты, сгруппированные по brand_id. Предзагружены `brand` и `variants.definition`.
     */
    public function parseSupplierRow(array $row, Collection $brands, Collection $rules, array $productsIndex): array
    {
        $title = $this->applyTitleRules((string) $row['title'], $rules);
        $hasSkipMarker = str_contains($title, '***');
        $matchedBrand = $this->detectBrand($title, $brands);
        $volume = $this->extractVolume($title);
        $concentration = $this->extractConcentration($title);
        $isTester = $this->extractIsTester($title);
        $genderMarker = $this->extractGenderMarker($title);
        $baseProductName = $this->extractBaseProductName($title, $matchedBrand['name'] ?? null);
        $productName = $baseProductName;

        $match = null;
        if (!$hasSkipMarker) {
            $brandId = $matchedBrand['id'] ?? null;
            $brandName = $matchedBrand['name'] ?? null;

            if ($genderMarker === 'l') {
                $femaleSearchName = $baseProductName;
                if ($baseProductName !== '' && !$this->containsFemaleMarker($baseProductName)) {
                    $femaleSearchName = $baseProductName.' for Woman';
                }
                $productName = $femaleSearchName;
                $match = $this->findBestMatch(
                    $brandId,
                    $brandName,
                    $femaleSearchName,
                    $volume,
                    $concentration,
                    $isTester,
                    $productsIndex,
                );
                if (!$match && $baseProductName !== '') {
                    $productName = $baseProductName;
                    $match = $this->findBestMatch(
                        $brandId,
                        $brandName,
                        $baseProductName,
                        $volume,
                        $concentration,
                        $isTester,
                        $productsIndex,
                        'female_or_unisex',
                    );
                }
            } elseif ($genderMarker === 'm') {
                $maleSearchName = $baseProductName;
                if ($baseProductName !== '' && ! $this->containsMaleMarker($baseProductName)) {
                    $maleSearchName = $baseProductName.' for Man';
                }
                $productName = $maleSearchName;
                $match = $this->findBestMatch(
                    $brandId,
                    $brandName,
                    $maleSearchName,
                    $volume,
                    $concentration,
                    $isTester,
                    $productsIndex,
                );
                if (! $match && $baseProductName !== '') {
                    $productName = $baseProductName;
                    $match = $this->findBestMatch(
                        $brandId,
                        $brandName,
                        $baseProductName,
                        $volume,
                        $concentration,
                        $isTester,
                        $productsIndex,
                        'male',
                    );
                }
            } else {
                $match = $this->findBestMatch(
                    $brandId,
                    $brandName,
                    $baseProductName,
                    $volume,
                    $concentration,
                    $isTester,
                    $productsIndex,
                );
            }
        }

        $breakdown = $this->makeBreakdown($match);
        $product = $match['product'] ?? null;
        $variant = $match['variant'] ?? null;

        return [
            'code' => (string) $row['code'],
            'title' => $title,
            'supplier_price' => $row['supplier_price'] ?? null,
            'in_stock' => array_key_exists('in_stock', $row) ? $row['in_stock'] : null,
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
                'display_name' => $variant->product
                    ? ProductDisplayName::forProduct($variant->product)
                    : ($product ? ProductDisplayName::forProduct($product) : null),
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
                'display_name' => ProductDisplayName::forProduct($product),
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
        ?string $requireGenderAttribute = null,
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
            $candidateTokens = $this->productTokensCache[(int) $product->id]
                ??= $this->productNameTokens((string) $product->name, $brandName);
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

            if (
                $requireGenderAttribute !== null
                && ! $this->productMatchesGenderAttribute($product, $requireGenderAttribute)
            ) {
                continue;
            }

            if ($prefixOrdered && $diff === 1) {
                $extraToken = $targetTokens[count($targetTokens) - 1] ?? '';
                if (
                    CatalogProductLinkNameTokenizer::isGenderCanonToken((string) $extraToken)
                    && ! CatalogProductLinkNameTokenizer::tokensContainGenderCanon($candidateTokens)
                ) {
                    continue;
                }

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

            // Объём у поставщика задан — другие флаконы (100 мл vs 2 мл) не рассматриваем.
            if (
                $volume !== null
                && ($variant->volume === null || abs((float) $variant->volume - $volume) > 0.01)
            ) {
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
        return CatalogProductLinkNameTokenizer::variantMatchTokens($name, $brandName);
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

    /**
     * @param  Collection<int, Brand>  $brands
     */
    private function detectBrand(string $title, Collection $brands): ?array
    {
        $normalizedTitle = $this->normalizeText($title);
        $best = null;
        $bestLen = 0;

        foreach ($brands as $brand) {
            $normalizedBrand = $this->brandNormalizedCache[(int) $brand->id]
                ??= $this->normalizeText(trim((string) $brand->name));
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

    private function extractBaseProductName(string $title, ?string $brandName): string
    {
        $name = $this->truncateBeforeFirstVariantMarker($title);

        if ($brandName) {
            $strip = ProductDisplayName::stripBrandFromName($brandName, $name);
            $name = $strip['name'];
        }

        return preg_replace('/\s+/', ' ', trim($name)) ?: '';
    }

    /**
     * Название товара — только часть строки до первого вариантного маркера.
     * Всё после (пол, тестер, объём, концентрация и т.п.) относится к варианту, не к продукту.
     */
    private function truncateBeforeFirstVariantMarker(string $title): string
    {
        $patterns = [
            '/\(\s*[a-zа-я]\s*\)/iu',
            '/\b(test|tester|тестер)\b/iu',
            '/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu',
            '/\b(edp|edt|edc|parfum|extrait)\b/iu',
            '/\b(vial|пробник|sample)\b/iu',
        ];

        $cutAt = null;
        foreach ($patterns as $pattern) {
            if (! preg_match($pattern, $title, $matches)) {
                continue;
            }

            $matched = (string) ($matches[0] ?? '');
            if ($matched === '') {
                continue;
            }

            $pos = mb_strpos($title, $matched);
            if ($pos !== false && ($cutAt === null || $pos < $cutAt)) {
                $cutAt = $pos;
            }
        }

        if ($cutAt === null) {
            return $title;
        }

        return mb_substr($title, 0, $cutAt);
    }

    private function productMatchesGenderAttribute(Product $product, string $expectedGender): bool
    {
        $optionIds = match ($expectedGender) {
            'female' => [self::GENDER_OPTION_FEMALE_ID],
            'male' => [self::GENDER_OPTION_MALE_ID],
            'female_or_unisex' => [self::GENDER_OPTION_FEMALE_ID, self::GENDER_OPTION_UNISEX_ID],
            default => [],
        };

        if ($optionIds === []) {
            return false;
        }

        return $this->productHasGenderOption($product, $optionIds);
    }

    /**
     * @param  list<int>  $optionIds
     */
    private function productHasGenderOption(Product $product, array $optionIds): bool
    {
        if (! $product->relationLoaded('attributeValues')) {
            return false;
        }

        foreach ($product->attributeValues as $value) {
            if ((int) $value->product_attribute_id !== self::GENDER_ATTRIBUTE_ID) {
                continue;
            }

            if (! $value->relationLoaded('selectedOptions')) {
                continue;
            }

            foreach ($value->selectedOptions as $selected) {
                $selectedOptionId = (int) ($selected->product_attribute_option_id ?? 0);
                if (in_array($selectedOptionId, $optionIds, true)) {
                    return true;
                }
            }
        }

        return false;
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

    private function containsMaleMarker(string $name): bool
    {
        return (bool) preg_match(
            '/\b(for\s*men|men|man|pour\s*homme|homme|male|муж(?:ской|ская|ское|чин))\b/iu',
            $name
        );
    }

    private function extractVolume(string $title): ?float
    {
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(ml|мл)\b/iu', $title, $matches)) {
            return $this->toFloat($matches[1]);
        }

        if (preg_match('/(\d+(?:[.,]\d+)?)(ml|мл)\b/iu', $title, $matches)) {
            return $this->toFloat($matches[1]);
        }

        return null;
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

    /**
     * @param  Collection<int, SellerOneMatchRule>  $rules
     */
    private function applyTitleRules(string $title, Collection $rules): string
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
