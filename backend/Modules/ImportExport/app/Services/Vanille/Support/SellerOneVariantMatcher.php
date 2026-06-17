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
 * Матчер поставщика Seller One (и приход XLS на склад — тот же класс).
 *
 * Строка делится на «название» и «хвост варианта» по первому из:
 *   vial, test|tester|тестер, \d+ ml, extrait de parfum.
 *
 * Лишние слова в хвосте (set, viak, «с крышкой» и т.д.) не задаются списком —
 * всё неизвестное после объёма/концентрации/tester → extra_tokens → 95%.
 *
 * Имя (после нормализации):
 *   • exact / exact_multiset → 80% база имени;
 *   • partial (+1 токен у поставщика) → 70%;
 *   • catalog_extra (+1 токен в каталоге) → 50%.
 *
 * При exact-имени хвост варианта сравнивается с вариантом каталога:
 *   • full — имя + вариант совпали → 100%, автосвязка;
 *   • variant_extra — лишние слова в хвосте («с крышкой») → 95%, без автосвязки;
 *   • name_only — имя совпало, вариант нет → 90%, без автосвязки.
 *
 * Parfum (в названии линии или в хвосте) ≠ Extrait De Parfum.
 *
 * Trailing «Parfume» / «Parfum» в имени линии до объёма (не «de Parfum»):
 *   линия без суффикса; вариант = Extrait De Parfum (перекрывает edp/edt в хвосте).
 *
 * «parfum» в хвосте варианта (50ml parfum test) = Extrait De Parfum, не отдельная концентрация parfum.
 *
 * Строки с «***» в названии не парсятся (пропуск матча и upsert в preview).
 */
class SellerOneVariantMatcher
{
    private const SCORE_FULL = 100;

    private const SCORE_VARIANT_EXTRA = 95;

    private const SCORE_NAME_ONLY = 90;

    private const SCORE_PARTIAL = 70;

    /** База при лишнем токене в имени каталога (подпоследовательность, diff +1 в catalog). */
    private const BASE_POINTS_CATALOG_EXTRA = 50;

    /** product_attributes: «Для кого» */
    private const GENDER_ATTRIBUTE_ID = 3;

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

    public function shouldSkipParsingTitle(string $title): bool
    {
        return str_contains($title, '***');
    }

    /**
     * @param  array{code?: string, title?: string, supplier_price?: mixed, in_stock?: mixed}  $row
     */
    public function shouldSkipParsingRow(array $row): bool
    {
        return $this->shouldSkipParsingTitle((string) ($row['title'] ?? ''));
    }

    /**
     * @param  array{code?: string, title?: string, supplier_price?: mixed, in_stock?: mixed}  $row
     * @param  Collection<int, Brand>  $brands
     * @param  Collection<int, SellerOneMatchRule>  $rules
     * @param  array<int, list<\Modules\Catalog\Models\Product>>  $productsIndex
     *         Продукты, сгруппированные по brand_id. Предзагружены `brand` и `variants.definition`.
     */
    public function parseSupplierRow(array $row, Collection $brands, Collection $rules, array $productsIndex): array
    {
        $title = $this->applyTitleRules((string) $row['title'], $rules);
        $hasSkipMarker = $this->shouldSkipParsingTitle($title);
        $matchedBrand = $this->detectBrand($title, $brands);
        $nameVariantSplit = $this->splitNameAndVariantTail($title);
        $variantTail = $nameVariantSplit['tail'];
        $variantSource = $variantTail !== '' ? $variantTail : $title;
        $volumeSpec = $this->parseVolumeFromText($variantSource);
        $volume = $volumeSpec['volume'];
        $volumeIsMultipack = $volumeSpec['is_multipack'];
        $volumeMultipackCount = $volumeSpec['multipack_count'];
        $volumeMultipackUnitMl = $volumeSpec['multipack_unit_volume'];
        $concentration = $this->extractConcentration($variantSource);
        $isTester = $this->extractIsTester($variantSource);
        $isVial = $this->extractIsVial($variantSource) || $this->extractIsVial($nameVariantSplit['name']);
        $genderMarker = $this->extractGenderMarker($title);
        $baseProductName = $this->extractBaseProductName($nameVariantSplit['name'], $matchedBrand['name'] ?? null);
        [$baseProductName, $concentration] = $this->applyTrailingParfumeLineNameRule(
            $baseProductName,
            $concentration,
        );
        if ($concentration === null && $this->supplierBaseContainsExtraitLineWord($baseProductName)) {
            $concentration = 'extrait de parfum';
        }
        $productName = $baseProductName;

        $match = null;
        if (!$hasSkipMarker) {
            $brandId = $matchedBrand['id'] ?? null;
            $brandName = $matchedBrand['name'] ?? null;

            if ($genderMarker === 'l') {
                $femaleSearchName = $baseProductName;
                if ($baseProductName !== '' && !$this->containsFemaleMarker($baseProductName) && ! $this->supplierBaseContainsPourLineWords($baseProductName)) {
                    $femaleSearchName = $baseProductName.' for Woman';
                }
                $productName = $femaleSearchName;
                $match = $this->findBestMatch(
                    $brandId,
                    $brandName,
                    $femaleSearchName,
                    $variantTail,
                    $volume,
                    $concentration,
                    $isTester,
                    $productsIndex,
                    null,
                    $baseProductName,
                    $genderMarker,
                    $brands,
                );
                if (! $this->isGenderCascadeProductResolved($match) && $baseProductName !== '') {
                    $productName = $baseProductName;
                    $match = $this->findBestMatch(
                        $brandId,
                        $brandName,
                        $baseProductName,
                        $variantTail,
                        $volume,
                        $concentration,
                        $isTester,
                        $productsIndex,
                        'female',
                        $baseProductName,
                        $genderMarker,
                        $brands,
                    );
                }
                if (! $this->isGenderCascadeProductResolved($match) && $baseProductName !== '') {
                    $productName = $baseProductName;
                    $match = $this->findBestMatch(
                        $brandId,
                        $brandName,
                        $baseProductName,
                        $variantTail,
                        $volume,
                        $concentration,
                        $isTester,
                        $productsIndex,
                        'unisex',
                        $baseProductName,
                        $genderMarker,
                        $brands,
                    );
                }
                if ($this->isGenderCascadeProductResolved($match)) {
                    $productName = $baseProductName;
                }
            } elseif ($genderMarker === 'm') {
                $maleSearchName = $baseProductName;
                if ($baseProductName !== '' && ! $this->containsMaleMarker($baseProductName) && ! $this->supplierBaseContainsPourLineWords($baseProductName)) {
                    $maleSearchName = $baseProductName.' for Man';
                }
                $productName = $maleSearchName;
                $match = $this->findBestMatch(
                    $brandId,
                    $brandName,
                    $maleSearchName,
                    $variantTail,
                    $volume,
                    $concentration,
                    $isTester,
                    $productsIndex,
                    null,
                    $baseProductName,
                    $genderMarker,
                    $brands,
                );
                if (! $this->isGenderCascadeProductResolved($match) && $baseProductName !== '') {
                    $productName = $baseProductName;
                    $match = $this->findBestMatch(
                        $brandId,
                        $brandName,
                        $baseProductName,
                        $variantTail,
                        $volume,
                        $concentration,
                        $isTester,
                        $productsIndex,
                        'male',
                        $baseProductName,
                        $genderMarker,
                        $brands,
                    );
                }
                if ($this->isGenderCascadeProductResolved($match)) {
                    $productName = $baseProductName;
                }
            } elseif ($genderMarker === 'u') {
                $unisexSearchName = $baseProductName;
                if ($baseProductName !== '' && ! $this->containsUnisexMarker($baseProductName)) {
                    $unisexSearchName = $baseProductName.' unisex';
                }
                $productName = $unisexSearchName;
                $match = $this->findBestMatch(
                    $brandId,
                    $brandName,
                    $unisexSearchName,
                    $variantTail,
                    $volume,
                    $concentration,
                    $isTester,
                    $productsIndex,
                    'unisex',
                    $baseProductName,
                    $genderMarker,
                    $brands,
                );
                if (! $this->isGenderCascadeProductResolved($match) && $baseProductName !== '' && $unisexSearchName !== $baseProductName) {
                    $productName = $baseProductName;
                    $match = $this->findBestMatch(
                        $brandId,
                        $brandName,
                        $baseProductName,
                        $variantTail,
                        $volume,
                        $concentration,
                        $isTester,
                        $productsIndex,
                        'unisex',
                        $baseProductName,
                        $genderMarker,
                        $brands,
                    );
                }
                if ($this->isGenderCascadeProductResolved($match)) {
                    $productName = $baseProductName;
                }
            } else {
                $match = $this->findBestMatch(
                    $brandId,
                    $brandName,
                    $baseProductName,
                    $variantTail,
                    $volume,
                    $concentration,
                    $isTester,
                    $productsIndex,
                    null,
                    $baseProductName,
                    null,
                    $brands,
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
                'volume_is_multipack' => $volumeIsMultipack,
                'volume_multipack_count' => $volumeMultipackCount,
                'volume_multipack_unit_ml' => $volumeMultipackUnitMl,
                'concentration' => $concentration,
                'is_tester' => $isTester,
                'is_vial' => $isVial,
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

    public function volumesMatch(?float $left, ?float $right): bool
    {
        if ($left === null || $right === null) {
            return false;
        }

        return round($left, 2) === round($right, 2);
    }

    /**
     * volume_ml в справочнике — целое число; дробные объёмы (1.5 ml, 1.2 ml) не округляем к ближайшему.
     */
    public function definitionVolumeMlForLookup(?float $volume): ?int
    {
        if ($volume === null) {
            return null;
        }

        $normalized = round($volume, 2);
        if (abs($normalized - round($normalized)) > 0.001) {
            return null;
        }

        return (int) round($normalized);
    }

    /**
     * @return array{
     *     volume: ?float,
     *     is_multipack: bool,
     *     multipack_count: ?int,
     *     multipack_unit_volume: ?float,
     * }
     */
    private function multipackVolumeMatchPatterns(): array
    {
        return [
            '/\b(\d+)\s*\*\s*(\d+(?:[.,]\d+)?)\s*(ml|мл)\b/iu',
            '/\b(\d+)\s*\*\s*(\d+(?:[.,]\d+)?)(ml|мл)\b/iu',
            '/\b(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|мл)\b/iu',
            '/\b(\d+)\s*x\s*(\d+(?:[.,]\d+)?)(ml|мл)\b/iu',
        ];
    }

    private function multipackVolumeStripPattern(): string
    {
        return '/\b\d+\s*[\*x]\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b|\b\d+\s*[\*x]\s*\d+(?:[.,]\d+)?(?:ml|мл)\b/iu';
    }

    private function comboVolumeSetMatchPattern(): string
    {
        $volume = '\d+(?:[.,]\d+)?\s*(?:ml|мл)';
        $concentration = '(?:edp|edt|edc|extrait\s+de\s+parfum|parfum|parfume|parfums)';

        // «20ml edp+20ml edp» — концентрация между объёмом и «+».
        return '/\b'.$volume.'\b(?:\s*'.$concentration.'\b)?\s*\+\s*\b'.$volume.'\b/iu';
    }

    public function textContainsComboVolumeSet(string $text): bool
    {
        return (bool) preg_match($this->comboVolumeSetMatchPattern(), $text);
    }

    private function textHasLimitedEditionMarker(string $text): bool
    {
        return (bool) preg_match($this->limitedEditionMarkerPattern(), $text);
    }

    private function limitedEditionMarkerPattern(): string
    {
        // Точки обязательны в L.E. — иначе «Le Parfumeur» даёт ложное срабатывание.
        return '/(?:\bl\.\s*e\.?\b|limited\s+edition|edition\s+limitee?e?)/iu';
    }

    /**
     * Хвост с Edition Limitee / Edition Gold и т.п. — не создавать автолинк на голый 50ml edt.
     */
    public function supplierVariantTailBlocksAutoLink(string $variantTail): bool
    {
        if ($this->textContainsComboVolumeSet($variantTail)) {
            return true;
        }

        $volumeSpec = $this->parseVolumeFromText($variantTail);
        if ($volumeSpec['is_multipack'] || ($volumeSpec['is_combo_set'] ?? false)) {
            return true;
        }

        if ($this->textHasLimitedEditionMarker($variantTail)) {
            return true;
        }

        $sig = $this->parseVariantTailSignature($variantTail);

        return $this->supplierExtraTokensBlockVariantMatch($sig['extra_tokens'] ?? []);
    }

    /**
     * @param  list<string>  $extraTokens
     */
    private function supplierExtraTokensBlockVariantMatch(array $extraTokens): bool
    {
        if ($extraTokens === []) {
            return false;
        }

        if (in_array('edition', $extraTokens, true)) {
            return true;
        }

        $blocking = ['limitee', 'gold', 'silver', 'platinum', 'anniversary', 'collector'];
        foreach ($extraTokens as $token) {
            if (in_array($token, $blocking, true)) {
                return true;
            }
        }

        return false;
    }

    private function supplierHasLimitedEditionMarker(string $variantTail, ?string $supplierBaseProductName): bool
    {
        if ($this->textHasLimitedEditionMarker($variantTail)) {
            return true;
        }

        return $supplierBaseProductName !== null
            && $supplierBaseProductName !== ''
            && $this->textHasLimitedEditionMarker($supplierBaseProductName);
    }

    private function catalogProductHasLimitedEditionMarker(Product $product): bool
    {
        if ($this->textHasLimitedEditionMarker((string) $product->name)) {
            return true;
        }

        foreach ($product->variants ?? [] as $variant) {
            if (! $variant instanceof ProductVariantLink) {
                continue;
            }

            if ($this->textHasLimitedEditionMarker(trim((string) ($variant->edition ?? '')))) {
                return true;
            }
        }

        return false;
    }

    private function limitedEditionMarkersAlign(string $variantTail, ?string $supplierBaseProductName, Product $product): bool
    {
        return $this->supplierHasLimitedEditionMarker($variantTail, $supplierBaseProductName)
            === $this->catalogProductHasLimitedEditionMarker($product);
    }

    /**
     * Номера линейки в имени (№9, 1/6, 1.7, Big Pony 1) — одиночные цифры в токенизаторе теряются.
     *
     * @return list<string>
     */
    private function extractProductEditionKeys(string $name): array
    {
        $keys = [];

        if (preg_match_all('/(?:№|no\.?|#)\s*(\d+)\b/iu', $name, $matches)) {
            foreach ($matches[1] as $number) {
                $normalized = ltrim((string) $number, '0');
                $keys[] = 'n:'.($normalized !== '' ? $normalized : '0');
            }
        }

        if (preg_match_all('/\b(\d+)\s*\/\s*(\d+)\b/u', $name, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $keys[] = 'f:'.((int) $match[1]).'/'.((int) $match[2]);
            }
        }

        if (preg_match_all('/\b(\d+\.\d+)\b/u', $name, $matches)) {
            foreach ($matches[1] as $decimal) {
                if (preg_match('/\b'.preg_quote((string) $decimal, '/').'\s*(ml|мл)\b/iu', $name)) {
                    continue;
                }
                $keys[] = 'd:'.(string) $decimal;
            }
        }

        $nameWithoutVolume = trim((string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', ' ', $name));
        $nameWithoutVolume = trim((string) preg_replace('/\s+/u', ' ', $nameWithoutVolume));
        if (
            $nameWithoutVolume !== ''
            && ! preg_match('/\b\d+\s*\/\s*\d+\s*$/u', $nameWithoutVolume)
            && ! preg_match('/\b\d+\.\d+\s*$/u', $nameWithoutVolume)
            && preg_match('/\b(\d+)\s*$/u', $nameWithoutVolume, $trailingMatch)
        ) {
            $normalized = ltrim((string) $trailingMatch[1], '0');
            $keys[] = 't:'.($normalized !== '' ? $normalized : '0');
        } elseif (
            $nameWithoutVolume !== ''
            && ! preg_match('/\b[a-z]\s+[a-z]\s*$/iu', $nameWithoutVolume)
            && preg_match('/\b([a-z])\s*$/iu', $nameWithoutVolume, $letterMatch)
        ) {
            $keys[] = 'l:'.Str::lower((string) $letterMatch[1]);
        }

        if ($nameWithoutVolume !== '' && preg_match_all('/(?:^|\s)x(?=\s)/iu', $nameWithoutVolume, $inlineXMatches)) {
            foreach ($inlineXMatches[0] as $_) {
                $keys[] = 'l:x';
            }
        }

        return array_values(array_unique($keys));
    }

    private function productEditionKeysMatch(string $supplierName, string $catalogName): bool
    {
        $supplierKeys = $this->extractProductEditionKeys($supplierName);
        $catalogKeys = $this->extractProductEditionKeys($catalogName);

        if ($supplierKeys === [] && $catalogKeys === []) {
            return true;
        }

        return $supplierKeys === $catalogKeys;
    }

    public function parseVolumeFromText(string $text): array
    {
        $empty = [
            'volume' => null,
            'is_multipack' => false,
            'is_combo_set' => false,
            'multipack_count' => null,
            'multipack_unit_volume' => null,
        ];

        $multipackPatterns = $this->multipackVolumeMatchPatterns();

        foreach ($multipackPatterns as $pattern) {
            if (! preg_match($pattern, $text, $matches)) {
                continue;
            }

            return [
                'volume' => null,
                'is_multipack' => true,
                'is_combo_set' => false,
                'multipack_count' => (int) $matches[1],
                'multipack_unit_volume' => $this->toFloat($matches[2]),
            ];
        }

        if ($this->textContainsComboVolumeSet($text)) {
            return [
                'volume' => null,
                'is_multipack' => false,
                'is_combo_set' => true,
                'multipack_count' => null,
                'multipack_unit_volume' => null,
            ];
        }

        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(ml|мл)\b/iu', $text, $matches)) {
            return [
                'volume' => $this->toFloat($matches[1]),
                'is_multipack' => false,
                'is_combo_set' => false,
                'multipack_count' => null,
                'multipack_unit_volume' => null,
            ];
        }

        if (preg_match('/(\d+(?:[.,]\d+)?)(ml|мл)\b/iu', $text, $matches)) {
            return [
                'volume' => $this->toFloat($matches[1]),
                'is_multipack' => false,
                'is_combo_set' => false,
                'multipack_count' => null,
                'multipack_unit_volume' => null,
            ];
        }

        return $empty;
    }

    /**
     * Основная точка входа: ищет лучший продукт и (опционально) его вариант-бонус.
     *
     * @return array{product: Product, variant: ProductVariantLink|null, base_points: int,
     *               name_level: 'exact'|'exact_multiset'|'partial'|'catalog_extra', name_percent: float, volume_match: bool,
     *               volume_points: int, concentration_match: bool, concentration_points: int,
     *               tester_match: bool, tester_points: int, total: int}|null
     */
    private function findBestMatch(
        ?int $brandId,
        ?string $brandName,
        string $productName,
        string $variantTail,
        ?float $volume,
        ?string $concentration,
        bool $isTester,
        array $productsIndex,
        ?string $requireGenderAttribute = null,
        ?string $supplierBaseProductName = null,
        ?string $supplierGenderMarker = null,
        ?Collection $brands = null,
    ): ?array {
        if (!$brandId || $productName === '' || !isset($productsIndex[$brandId])) {
            return null;
        }

        $targetTokens = $this->productNameTokens($productName, $brandName);
        if (empty($targetTokens)) {
            return null;
        }

        $best = null;
        $candidateProducts = $this->collectProductsForBrandMatch(
            $brandId,
            $brandName,
            $productsIndex,
            $brands ?? new Collection(),
        );

        foreach ($candidateProducts as $product) {
            $candidateBrandName = $product->relationLoaded('brand') && $product->brand
                ? trim((string) $product->brand->name)
                : trim((string) ($brandName ?? ''));
            $candidateTokens = $this->productTokensCache[(int) $product->id]
                ??= $this->productNameTokens(
                    (string) $product->name,
                    $candidateBrandName !== '' ? $candidateBrandName : null,
                );
            if (empty($candidateTokens)) {
                continue;
            }

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

            $multisetExact = !$prefixOrdered
                && count($targetTokens) === count($candidateTokens)
                && $this->tokensMultisetEqual($targetTokens, $candidateTokens);

            $catalogExtraToken = !$prefixOrdered
                && !$multisetExact
                && $this->supplierMatchesCatalogWithOneExtraCatalogToken($targetTokens, $candidateTokens);

            $supplierInlineBrandExtra = !$prefixOrdered
                && !$multisetExact
                && !$catalogExtraToken
                && $diff === 1
                && $this->supplierMatchesCatalogWithSkippedInlineBrandToken(
                    $targetTokens,
                    $candidateTokens,
                    $brandName,
                );

            if (!$prefixOrdered && !$multisetExact && !$catalogExtraToken && !$supplierInlineBrandExtra) {
                continue;
            }

            if ($this->productMatchIsGenderCanonOnly($targetTokens, $candidateTokens)) {
                continue;
            }

            if (
                $requireGenderAttribute !== null
                && ! $this->productMatchesGenderAttribute($product, $requireGenderAttribute)
            ) {
                continue;
            }

            if ($this->supplierGenderConflictsCatalog($supplierGenderMarker, $product, $requireGenderAttribute)) {
                continue;
            }

            if (! $this->limitedEditionMarkersAlign($variantTail, $supplierBaseProductName, $product)) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->catalogNameContainsPourLineSuffix((string) $product->name)
                && ! $this->supplierBaseContainsPourLineWords($supplierBaseProductName)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->catalogNameContainsForHerHimLineSuffix((string) $product->name)
                && ! $this->supplierBaseContainsForHerHimLineWords($supplierBaseProductName)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->supplierBaseContainsForHerHimLineWords($supplierBaseProductName)
                && ! $this->catalogNameContainsForHerHimLineSuffix((string) $product->name)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->catalogNameContainsParfumLineWord((string) $product->name)
                && ! $this->supplierBaseContainsParfumLineWord($supplierBaseProductName)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->supplierBaseContainsExtraitLineWord($supplierBaseProductName)
                && ! $this->catalogNameContainsExtraitLineWord((string) $product->name)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->catalogNameContainsExtraitLineWord((string) $product->name)
                && ! $this->supplierBaseContainsExtraitLineWord($supplierBaseProductName)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->supplierBaseContainsShowerGelLineMarker($supplierBaseProductName)
                && ! $this->catalogNameContainsShowerGelLineMarker((string) $product->name)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->catalogNameContainsShowerGelLineMarker((string) $product->name)
                && ! $this->supplierBaseContainsShowerGelLineMarker($supplierBaseProductName)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->supplierBaseContainsLaLineMarker($supplierBaseProductName)
                && ! $this->catalogNameContainsLaLineMarker((string) $product->name)
            ) {
                continue;
            }

            if (
                $supplierBaseProductName !== null
                && $supplierBaseProductName !== ''
                && $this->catalogNameContainsLaLineMarker((string) $product->name)
                && ! $this->supplierBaseContainsLaLineMarker($supplierBaseProductName)
            ) {
                continue;
            }

            if (
                ! $this->productEditionKeysMatch(
                    ($supplierBaseProductName !== null && $supplierBaseProductName !== '')
                        ? $supplierBaseProductName
                        : $productName,
                    (string) $product->name,
                )
            ) {
                continue;
            }

            if ($catalogExtraToken) {
                if ($this->catalogExtraIsGenderOnlySuffix($targetTokens, $candidateTokens)) {
                    $variantMatch = $this->resolveExactNameVariantMatch($product, $variantTail, $concentration);
                    $candidate = [
                        'product' => $product,
                        'variant' => $variantMatch['variant'],
                        'base_points' => 80,
                        'name_level' => 'exact',
                        'name_percent' => (float) $variantMatch['total'],
                        'link_match_level' => $variantMatch['link_match_level'],
                        'volume_match' => $variantMatch['volume_match'],
                        'volume_points' => $variantMatch['volume_points'],
                        'concentration_match' => $variantMatch['concentration_match'],
                        'concentration_points' => $variantMatch['concentration_points'],
                        'tester_match' => $variantMatch['tester_match'],
                        'tester_points' => 0,
                        'total' => $variantMatch['total'],
                    ];
                } else {
                    $variantMatch = $this->resolveExactNameVariantMatch($product, $variantTail, $concentration);
                    if ($variantMatch['variant'] !== null) {
                        $candidate = [
                            'product' => $product,
                            'variant' => $variantMatch['variant'],
                            'base_points' => self::BASE_POINTS_CATALOG_EXTRA,
                            'name_level' => 'catalog_extra',
                            'name_percent' => (float) self::BASE_POINTS_CATALOG_EXTRA,
                            'link_match_level' => $variantMatch['link_match_level'],
                            'volume_match' => $variantMatch['volume_match'],
                            'volume_points' => $variantMatch['volume_points'],
                            'concentration_match' => $variantMatch['concentration_match'],
                            'concentration_points' => $variantMatch['concentration_points'],
                            'tester_match' => $variantMatch['tester_match'],
                            'tester_points' => 0,
                            'total' => self::BASE_POINTS_CATALOG_EXTRA,
                        ];
                    } else {
                        $candidate = $this->buildNameOnlyCandidate(
                            $product,
                            self::BASE_POINTS_CATALOG_EXTRA,
                            (float) self::BASE_POINTS_CATALOG_EXTRA,
                            'catalog_extra',
                            'none',
                            self::BASE_POINTS_CATALOG_EXTRA,
                        );
                    }
                }
            } elseif ($supplierInlineBrandExtra) {
                $candidate = $this->buildNameOnlyCandidate(
                    $product,
                    self::SCORE_PARTIAL,
                    (float) self::SCORE_PARTIAL,
                    'partial',
                    'none',
                    self::SCORE_PARTIAL,
                );
            } elseif ($prefixOrdered && $diff === 1) {
                $extraToken = $targetTokens[count($targetTokens) - 1] ?? '';
                if (CatalogProductLinkNameTokenizer::isProductLineMarkerToken((string) $extraToken)) {
                    continue;
                }

                if ($this->supplierExtraIsGenderOnlySuffix($targetTokens, $candidateTokens)) {
                    $variantMatch = $this->resolveExactNameVariantMatch($product, $variantTail, $concentration);
                    $candidate = [
                        'product' => $product,
                        'variant' => $variantMatch['variant'],
                        'base_points' => 80,
                        'name_level' => 'exact',
                        'name_percent' => (float) $variantMatch['total'],
                        'link_match_level' => $variantMatch['link_match_level'],
                        'volume_match' => $variantMatch['volume_match'],
                        'volume_points' => $variantMatch['volume_points'],
                        'concentration_match' => $variantMatch['concentration_match'],
                        'concentration_points' => $variantMatch['concentration_points'],
                        'tester_match' => $variantMatch['tester_match'],
                        'tester_points' => 0,
                        'total' => $variantMatch['total'],
                    ];
                } else {
                    continue;
                }
            } else {
                $nameLevel = $multisetExact ? 'exact_multiset' : 'exact';
                $variantMatch = $this->resolveExactNameVariantMatch($product, $variantTail, $concentration);
                $candidate = [
                    'product' => $product,
                    'variant' => $variantMatch['variant'],
                    'base_points' => 80,
                    'name_level' => $nameLevel,
                    'name_percent' => (float) $variantMatch['total'],
                    'link_match_level' => $variantMatch['link_match_level'],
                    'volume_match' => $variantMatch['volume_match'],
                    'volume_points' => $variantMatch['volume_points'],
                    'concentration_match' => $variantMatch['concentration_match'],
                    'concentration_points' => $variantMatch['concentration_points'],
                    'tester_match' => $variantMatch['tester_match'],
                    'tester_points' => 0,
                    'total' => $variantMatch['total'],
                ];
            }

            if (
                !$best
                || $candidate['total'] > $best['total']
                || ($candidate['total'] === $best['total'] && $candidate['variant'] && !$best['variant'])
            ) {
                $best = $candidate;
            }
        }

        return $best;
    }

    /**
     * «12 Parfumeurs» в прайсе + товар бренда «12 Parfumeurs Francais» — тот же семейный бренд.
     *
     * @param  array<int, list<Product>>  $productsIndex
     * @return list<Product>
     */
    private function collectProductsForBrandMatch(
        int $brandId,
        ?string $brandName,
        array $productsIndex,
        Collection $brands,
    ): array {
        if (! isset($productsIndex[$brandId])) {
            return [];
        }

        $merged = $productsIndex[$brandId];
        $seenIds = [];
        foreach ($merged as $product) {
            $seenIds[(int) $product->id] = true;
        }

        $brandName = trim((string) $brandName);
        if ($brandName === '') {
            return $merged;
        }

        $prefix = $brandName.' ';
        foreach ($brands as $brand) {
            $extendedId = (int) $brand->id;
            if ($extendedId === $brandId) {
                continue;
            }
            if (! Str::startsWith(trim((string) $brand->name), $prefix)) {
                continue;
            }
            if (! isset($productsIndex[$extendedId])) {
                continue;
            }
            foreach ($productsIndex[$extendedId] as $product) {
                $productId = (int) $product->id;
                if (isset($seenIds[$productId])) {
                    continue;
                }
                $seenIds[$productId] = true;
                $merged[] = $product;
            }
        }

        return $merged;
    }

    /**
     * @return array{
     *     variant: ProductVariantLink|null,
     *     total: int,
     *     link_match_level: string,
     *     volume_match: bool,
     *     volume_points: int,
     *     concentration_match: bool,
     *     concentration_points: int,
     *     tester_match: bool,
     * }
     */
    private function resolveExactNameVariantMatch(
        Product $product,
        string $variantTail,
        ?string $supplierConcentration = null,
    ): array
    {
        $empty = [
            'variant' => null,
            'total' => self::SCORE_NAME_ONLY,
            'link_match_level' => 'name_only',
            'volume_match' => false,
            'volume_points' => 0,
            'concentration_match' => false,
            'concentration_points' => 0,
            'tester_match' => false,
        ];

        $supplierSig = $this->parseVariantTailSignature($variantTail);
        if ($supplierConcentration !== null) {
            $supplierSig['concentration'] = $supplierConcentration;
        } elseif ($supplierSig['concentration'] === null && $this->catalogNameContainsExtraitLineWord((string) $product->name)) {
            $supplierSig['concentration'] = 'extrait de parfum';
        }
        if (!$this->supplierVariantSignatureHasCoreFields($supplierSig)) {
            return $empty;
        }

        $bestVariant = null;
        $bestStatus = 'mismatch';
        $bestRank = 0;

        foreach ($product->variants ?? [] as $variant) {
            if (!$variant instanceof ProductVariantLink) {
                continue;
            }

            $status = $this->compareVariantSignatures($supplierSig, $this->catalogVariantSignature($variant, $product));
            $rank = match ($status) {
                'exact' => 3,
                'extra' => 2,
                default => 0,
            };

            if ($rank > $bestRank) {
                $bestRank = $rank;
                $bestStatus = $status;
                $bestVariant = $variant;
            }
        }

        if ($bestVariant === null || $bestRank === 0) {
            return $empty;
        }

        $catalogSig = $this->catalogVariantSignature($bestVariant, $product);
        $volumeMatch = $this->volumesMatch($supplierSig['volume'], $catalogSig['volume']);
        $concMatch = $supplierSig['concentration'] !== null
            && $catalogSig['concentration'] !== null
            && $supplierSig['concentration'] === $catalogSig['concentration'];
        $testerMatch = $supplierSig['is_tester'] === $catalogSig['is_tester']
            && (bool) ($supplierSig['is_vial'] ?? false) === (bool) ($catalogSig['is_vial'] ?? false);

        $total = match ($bestStatus) {
            'exact' => self::SCORE_FULL,
            'extra' => self::SCORE_VARIANT_EXTRA,
            default => self::SCORE_NAME_ONLY,
        };

        return [
            'variant' => $bestVariant,
            'total' => $total,
            'link_match_level' => $bestStatus === 'exact' ? 'full' : 'variant_extra',
            'volume_match' => $volumeMatch,
            'volume_points' => $volumeMatch ? 12 : 0,
            'concentration_match' => $concMatch,
            'concentration_points' => $concMatch ? 8 : 0,
            'tester_match' => $testerMatch,
        ];
    }

    /**
     * @return array{volume: ?float, volume_is_multipack: bool, concentration: ?string, is_tester: bool, is_vial: bool, has_limited_edition: bool, extra_tokens: list<string>}
     */
    private function parseVariantTailSignature(string $tail): array
    {
        $work = preg_replace('/\s+/u', ' ', trim($tail)) ?: '';
        if ($work === '') {
            return [
                'volume' => null,
                'volume_is_multipack' => false,
                'volume_is_combo_set' => false,
                'concentration' => null,
                'is_tester' => false,
                'is_vial' => false,
                'has_limited_edition' => false,
                'extra_tokens' => [],
            ];
        }

        $volume = null;
        $volumeIsMultipack = false;
        $volumeIsComboSet = false;
        $concentration = null;
        $isTester = false;
        $isVial = false;
        $hasLimitedEdition = $this->textHasLimitedEditionMarker($work);
        if ($hasLimitedEdition) {
            $work = (string) preg_replace($this->limitedEditionMarkerPattern(), ' ', $work);
        }

        $volumeSpec = $this->parseVolumeFromText($work);
        if ($volumeSpec['is_multipack']) {
            $volumeIsMultipack = true;
            $work = (string) preg_replace($this->multipackVolumeStripPattern(), ' ', $work, 1);
        } elseif ($volumeSpec['is_combo_set'] ?? false) {
            $volumeIsComboSet = true;
            $work = (string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(?:ml|мл)\b/iu', ' ', $work);
            $work = (string) preg_replace('/\b\d+(?:[.,]\d+)?(?:ml|мл)\b/iu', ' ', $work);
            $work = (string) preg_replace('/[+()]/u', ' ', $work);
        } elseif ($volumeSpec['volume'] !== null) {
            $volume = $volumeSpec['volume'];
            if (preg_match('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', $work)) {
                $work = (string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', ' ', $work, 1);
            } else {
                $work = (string) preg_replace('/\b\d+(?:[.,]\d+)?(?:ml|мл)\b/iu', ' ', $work, 1);
            }
        }

        if (preg_match('/\bextrait\s+de\s+parfum\b/iu', $work)) {
            $concentration = 'extrait de parfum';
            $work = (string) preg_replace('/\bextrait\s+de\s+parfum\b/iu', ' ', $work, 1);
        }

        if (preg_match('/\b(edp|edt|edc)\b/iu', $work, $matches)) {
            if ($concentration === null) {
                $concentration = $this->normalizeConcentration((string) $matches[1]);
            }
            $work = (string) preg_replace('/\b(edp|edt|edc)\b/iu', ' ', $work, 1);
        }

        if ($concentration === null && preg_match('/\b(parfum|parfume|parfums)\b/iu', $work)) {
            $concentration = 'extrait de parfum';
            $work = (string) preg_replace('/\b(parfum|parfume|parfums)\b/iu', ' ', $work, 1);
        }

        if (preg_match('/\b(test|tester|тестер)\b/iu', $work)) {
            $isTester = true;
            $work = (string) preg_replace('/\b(test|tester|тестер)\b/iu', ' ', $work, 1);
        }

        if (preg_match('/\bvial\b/iu', $work)) {
            $isVial = true;
            $work = (string) preg_replace('/\bvial\b/iu', ' ', $work, 1);
        }

        // Поставщик иногда дублирует объём/концентрацию в хвосте («100ml Extrait de Parfum 100ml»).
        // Это не «лишние слова» варианта — убираем повторы, уже извлеённые выше.
        if ($volume !== null || $volumeIsMultipack || $volumeIsComboSet) {
            $work = (string) preg_replace($this->multipackVolumeStripPattern(), ' ', $work);
            $work = (string) preg_replace('/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu', ' ', $work);
            $work = (string) preg_replace('/\b\d+(?:[.,]\d+)?(?:ml|мл)\b/iu', ' ', $work);
        }

        if ($concentration !== null) {
            $work = (string) preg_replace('/\bextrait\s+de\s+parfum\b/iu', ' ', $work);
            $work = (string) preg_replace('/\b(edp|edt|edc)\b/iu', ' ', $work);
            $work = (string) preg_replace('/\b(parfum|parfume|parfums)\b/iu', ' ', $work);
        }

        if ($isTester) {
            $work = (string) preg_replace('/\b(test|tester|тестер)\b/iu', ' ', $work);
        }

        if ($isVial) {
            $work = (string) preg_replace('/\bvial\b/iu', ' ', $work);
        }

        $work = $this->normalizeText($work);
        $extraTokens = array_values(array_filter(
            preg_split('/\s+/u', $work) ?: [],
            static fn (string $token): bool => mb_strlen($token) >= 2,
        ));

        return [
            'volume' => $volume,
            'volume_is_multipack' => $volumeIsMultipack,
            'volume_is_combo_set' => $volumeIsComboSet,
            'concentration' => $concentration,
            'is_tester' => $isTester,
            'is_vial' => $isVial,
            'has_limited_edition' => $hasLimitedEdition,
            'extra_tokens' => $extraTokens,
        ];
    }

    /**
     * @return array{volume: ?float, concentration: ?string, is_tester: bool, is_vial: bool, has_limited_edition: bool}
     */
    private function catalogVariantSignature(ProductVariantLink $variant, ?Product $product = null): array
    {
        $volume = $variant->volume !== null ? (float) $variant->volume : null;
        $concentration = $this->normalizeConcentration((string) ($variant->concentration ?? ''));
        $editionText = trim((string) ($variant->edition ?? ''));
        $productName = $product !== null
            ? (string) $product->name
            : ($variant->relationLoaded('product') && $variant->product
                ? (string) $variant->product->name
                : '');

        return [
            'volume' => $volume,
            'concentration' => $concentration,
            'is_tester' => (bool) ($variant->definition?->is_tester ?? false),
            'is_vial' => (bool) ($variant->definition?->is_vial ?? false),
            'has_limited_edition' => $this->textHasLimitedEditionMarker($editionText)
                || $this->textHasLimitedEditionMarker($productName),
        ];
    }

    /**
     * @param  array{volume: ?float, concentration: ?string, is_tester: bool, is_vial?: bool, has_limited_edition?: bool, extra_tokens: list<string>}  $supplier
     * @param  array{volume: ?float, concentration: ?string, is_tester: bool, is_vial?: bool, has_limited_edition?: bool}  $catalog
     */
    private function compareVariantSignatures(array $supplier, array $catalog): string
    {
        if (!$this->coreVariantFieldsMatch($supplier, $catalog)) {
            return 'mismatch';
        }

        if ($this->supplierExtraTokensBlockVariantMatch($supplier['extra_tokens'] ?? [])) {
            return 'mismatch';
        }

        return $supplier['extra_tokens'] !== [] ? 'extra' : 'exact';
    }

    /**
     * @param  array{volume: ?float, concentration: ?string, is_tester: bool, is_vial?: bool, extra_tokens: list<string>}  $supplier
     */
    private function supplierVariantSignatureHasCoreFields(array $supplier): bool
    {
        return $supplier['volume'] !== null
            || !empty($supplier['volume_is_multipack'])
            || $supplier['concentration'] !== null
            || $supplier['is_tester']
            || !empty($supplier['is_vial']);
    }

    /**
     * @param  array{volume: ?float, concentration: ?string, is_tester: bool, is_vial?: bool, has_limited_edition?: bool, extra_tokens: list<string>}  $supplier
     * @param  array{volume: ?float, concentration: ?string, is_tester: bool, is_vial?: bool, has_limited_edition?: bool}  $catalog
     */
    private function coreVariantFieldsMatch(array $supplier, array $catalog): bool
    {
        if (!empty($supplier['volume_is_multipack']) || !empty($supplier['volume_is_combo_set'])) {
            return false;
        }

        if (($supplier['has_limited_edition'] ?? false) !== ($catalog['has_limited_edition'] ?? false)) {
            return false;
        }

        if ($supplier['volume'] !== null) {
            if (!$this->volumesMatch($supplier['volume'], $catalog['volume'])) {
                return false;
            }
        }

        if ($supplier['concentration'] !== $catalog['concentration']) {
            return false;
        }

        if ($supplier['is_tester'] !== ($catalog['is_tester'] ?? false)) {
            return false;
        }

        return (bool) ($supplier['is_vial'] ?? false) === (bool) ($catalog['is_vial'] ?? false);
    }

    /**
     * @return array{
     *     product: Product,
     *     variant: null,
     *     base_points: int,
     *     name_level: string,
     *     name_percent: float,
     *     link_match_level: string,
     *     volume_match: bool,
     *     volume_points: int,
     *     concentration_match: bool,
     *     concentration_points: int,
     *     tester_match: bool,
     *     tester_points: int,
     *     total: int,
     * }
     */
    private function buildNameOnlyCandidate(
        Product $product,
        int $basePoints,
        float $namePercent,
        string $nameLevel,
        string $linkMatchLevel,
        int $total,
    ): array {
        return [
            'product' => $product,
            'variant' => null,
            'base_points' => $basePoints,
            'name_level' => $nameLevel,
            'name_percent' => $namePercent,
            'link_match_level' => $linkMatchLevel,
            'volume_match' => false,
            'volume_points' => 0,
            'concentration_match' => false,
            'concentration_points' => 0,
            'tester_match' => false,
            'tester_points' => 0,
            'total' => $total,
        ];
    }

    /**
     * @return array{name: string, tail: string}
     */
    public function splitNameAndVariantTail(string $title): array
    {
        $title = preg_replace('/\s+/u', ' ', trim($title)) ?: '';
        if ($title === '') {
            return ['name' => '', 'tail' => ''];
        }

        $patterns = [
            '/\b\d+\s*\*\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b/iu',
            '/\b\d+\s*\*\s*\d+(?:[.,]\d+)?(?:ml|мл)\b/iu',
            '/\b\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:ml|мл)\b/iu',
            '/\b\d+\s*x\s*\d+(?:[.,]\d+)?(?:ml|мл)\b/iu',
            '/\bextrait\s+de\s+parfum\b/iu',
            '/\b(edp|edt|edc)\b/iu',
            '/\bvial\b/iu',
            '/\b(test|tester|тестер)\b/iu',
            '/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/iu',
            '/\b\d+(?:[.,]\d+)?(?:ml|мл)\b/iu',
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
            return ['name' => $title, 'tail' => ''];
        }

        return [
            'name' => trim(mb_substr($title, 0, $cutAt)),
            'tail' => trim(mb_substr($title, $cutAt)),
        ];
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
     * Токены поставщика — подпоследовательность каталога, в каталоге ровно на 1 токен больше.
     *
     * @param  list<string>  $supplier
     * @param  list<string>  $catalog
     */
    private function supplierMatchesCatalogWithOneExtraCatalogToken(array $supplier, array $catalog): bool
    {
        if (count($catalog) !== count($supplier) + 1 || $supplier === []) {
            return false;
        }

        $supplierIndex = 0;
        $skipped = 0;

        foreach ($catalog as $catalogToken) {
            if (
                $supplierIndex < count($supplier)
                && $supplier[$supplierIndex] === $catalogToken
            ) {
                $supplierIndex++;

                continue;
            }

            $skipped++;
            if ($skipped > 1) {
                return false;
            }
        }

        return $supplierIndex === count($supplier) && $skipped === 1;
    }

    /**
     * Поставщик: «Eau De Iceberg Sensual Musk», каталог: «Eau De Sensual Musk» —
     * лишний токен = повтор бренда в середине линии (Iceberg), не отдельный продукт.
     *
     * @param  list<string>  $supplier
     * @param  list<string>  $catalog
     */
    private function supplierMatchesCatalogWithSkippedInlineBrandToken(
        array $supplier,
        array $catalog,
        ?string $brandName,
    ): bool {
        if (count($supplier) !== count($catalog) + 1 || $catalog === []) {
            return false;
        }

        $brandNorm = $brandName !== null && $brandName !== ''
            ? $this->normalizeText($brandName)
            : '';
        if ($brandNorm === '') {
            return false;
        }

        $catalogIndex = 0;
        $skippedBrand = false;

        foreach ($supplier as $supplierToken) {
            if (
                $catalogIndex < count($catalog)
                && $supplierToken === $catalog[$catalogIndex]
            ) {
                $catalogIndex++;

                continue;
            }

            if (! $skippedBrand && $supplierToken === $brandNorm) {
                $skippedBrand = true;

                continue;
            }

            return false;
        }

        return $catalogIndex === count($catalog) && $skippedBrand;
    }

    /**
     * @param  list<string>  $supplier
     * @param  list<string>  $catalog
     */
    private function catalogExtraIsGenderOnlySuffix(array $supplier, array $catalog): bool
    {
        if (count($catalog) !== count($supplier) + 1 || $supplier === []) {
            return false;
        }

        $supplierIndex = 0;
        $skippedToken = null;

        foreach ($catalog as $catalogToken) {
            if (
                $supplierIndex < count($supplier)
                && $supplier[$supplierIndex] === $catalogToken
            ) {
                $supplierIndex++;

                continue;
            }

            if ($skippedToken !== null) {
                return false;
            }

            $skippedToken = $catalogToken;
        }

        if ($supplierIndex !== count($supplier) || $skippedToken === null) {
            return false;
        }

        return CatalogProductLinkNameTokenizer::isGenderCanonToken($skippedToken);
    }

    /**
     * Поставщик: «… for Woman» → __linkgf__; каталог без пола в названии — то же совпадение линии.
     *
     * @param  list<string>  $supplier
     * @param  list<string>  $catalog
     */
    private function supplierExtraIsGenderOnlySuffix(array $supplier, array $catalog): bool
    {
        if (count($supplier) !== count($catalog) + 1 || $catalog === []) {
            return false;
        }

        $extraToken = $supplier[count($supplier) - 1] ?? '';
        if (
            ! CatalogProductLinkNameTokenizer::isGenderCanonToken((string) $extraToken)
            || CatalogProductLinkNameTokenizer::tokensContainGenderCanon($catalog)
        ) {
            return false;
        }

        for ($i = 0, $n = count($catalog); $i < $n; $i++) {
            if ($supplier[$i] !== $catalog[$i]) {
                return false;
            }
        }

        return true;
    }

    /** Имя продукта совпало (exact) — каскад (L)/(M) можно не продолжать. */
    private function isGenderCascadeProductResolved(?array $match): bool
    {
        if ($match === null) {
            return false;
        }

        return in_array((string) ($match['name_level'] ?? ''), ['exact', 'exact_multiset'], true);
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
                'link_match_level' => 'none',
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
            'link_match_level' => (string) ($match['link_match_level'] ?? 'none'),
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

    private function extractBaseProductName(string $namePart, ?string $brandName): string
    {
        $name = (string) preg_replace('/\(\s*[mlwu]\s*\)/iu', ' ', $namePart);
        $name = preg_replace('/\s+/u', ' ', trim($name)) ?: '';

        if ($brandName) {
            $name = $this->stripBrandPrefixFromName($brandName, $name);
        }

        return preg_replace('/\s+/', ' ', trim($name)) ?: '';
    }

    /**
     * «… Holiday Parfume 75ml test» / «… Gaharu Parfum 30ml» — Parfum(e) в конце линии = Extrait De Parfum.
     * «Pasha de Parfum» — часть названия линии, не снимаем.
     *
     * @return array{0: string, 1: ?string}
     */
    private function applyTrailingParfumeLineNameRule(string $baseProductName, ?string $concentration): array
    {
        if (! $this->supplierBaseEndsWithTrailingParfumeMarker($baseProductName)) {
            return [$baseProductName, $concentration];
        }

        $lineName = $this->stripTrailingParfumeFromProductName($baseProductName);
        // «… Parfum (L) 10ml edp» — линия Parfum = Extrait De Parfum; edp в хвосте у поставщика не авторитетен.
        $concentration = 'extrait de parfum';

        return [$lineName, $concentration];
    }

    private function supplierBaseEndsWithTrailingParfumeMarker(string $name): bool
    {
        $trimmed = trim($name);
        if ($trimmed === '' || $this->nameEndsWithDeParfumLineSuffix($trimmed)) {
            return false;
        }

        return (bool) preg_match('/\bparfum(?:e)?(?:s)?\s*$/iu', $trimmed);
    }

    private function stripTrailingParfumeFromProductName(string $name): string
    {
        $trimmed = trim($name);
        if ($trimmed === '' || $this->nameEndsWithDeParfumLineSuffix($trimmed)) {
            return $trimmed;
        }

        $stripped = preg_replace('/\bparfum(?:e)?(?:s)?\s*$/iu', '', $trimmed) ?? '';

        return preg_replace('/\s+/u', ' ', trim($stripped)) ?: '';
    }

    private function nameEndsWithDeParfumLineSuffix(string $name): bool
    {
        return (bool) preg_match('/\bde\s+parfum(?:e)?(?:s)?\s*$/iu', trim($name));
    }

    private function stripBrandPrefixFromName(string $brandName, string $productName): string
    {
        $brandName = trim($brandName);
        $productName = trim($productName);
        if ($brandName === '' || $productName === '') {
            return $productName;
        }

        $variants = [$brandName];
        $noAmp = str_replace('&', ' and ', $brandName);
        $withAmp = preg_replace('/\band\b/iu', '&', $brandName) ?? $brandName;
        foreach ([$noAmp, $withAmp] as $variant) {
            $variant = trim($variant);
            if ($variant !== '' && !in_array($variant, $variants, true)) {
                $variants[] = $variant;
            }
        }

        foreach ($variants as $variant) {
            $prefixPattern = '/^'.preg_quote($variant, '/').'\s+/iu';
            if (preg_match($prefixPattern, $productName) === 1) {
                return trim((string) preg_replace($prefixPattern, '', $productName, 1));
            }
        }

        return $productName;
    }

    private function productMatchesGenderAttribute(Product $product, string $expectedGender): bool
    {
        $optionIds = match ($expectedGender) {
            'female' => [self::GENDER_OPTION_FEMALE_ID],
            'male' => [self::GENDER_OPTION_MALE_ID],
            'unisex' => [self::GENDER_OPTION_UNISEX_ID],
            default => [],
        };

        if ($optionIds === []) {
            return false;
        }

        return $this->productHasGenderOption($product, $optionIds);
    }

    private function catalogProductGenderBucket(Product $product): ?string
    {
        if ($this->productMatchesGenderAttribute($product, 'male')) {
            return 'male';
        }
        if ($this->productMatchesGenderAttribute($product, 'female')) {
            return 'female';
        }
        if ($this->productMatchesGenderAttribute($product, 'unisex')) {
            return 'unisex';
        }

        return null;
    }

    /**
     * (M) не должен матчиться с «Для кого: Женский»; (L) — с «Мужской».
     * Унисекс — только на явном unisex-проходе каскада (L, pass 3).
     */
    private function supplierGenderConflictsCatalog(
        ?string $supplierGenderMarker,
        Product $product,
        ?string $requireGenderAttribute = null,
    ): bool {
        if ($supplierGenderMarker === null || $supplierGenderMarker === 'u') {
            return false;
        }

        $catalogGender = $this->catalogProductGenderBucket($product);
        if ($catalogGender === null) {
            return false;
        }

        if ($requireGenderAttribute === 'unisex' && $catalogGender === 'unisex') {
            return false;
        }

        return match ($supplierGenderMarker) {
            'm' => in_array($catalogGender, ['female', 'unisex'], true),
            'l' => in_array($catalogGender, ['male', 'unisex'], true),
            default => false,
        };
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
        if (!preg_match('/\(\s*([mlu])\s*\)/iu', $title, $matches)) {
            return null;
        }

        return Str::lower((string) ($matches[1] ?? '')) ?: null;
    }

    private function containsUnisexMarker(string $name): bool
    {
        return (bool) preg_match(
            '/\b(unisex|uni\s*sex|унисекс)\b/iu',
            $name
        );
    }

    /**
     * «Pour Homme / Pour Femme» — часть названия линии, не маркер пола.
     * Eau de Iceberg ≠ Eau de Iceberg Pour Homme.
     */
    private function catalogNameContainsPourLineSuffix(string $catalogProductName): bool
    {
        return (bool) preg_match('/\b(pour\s+homme|pour\s+femme)\b/iu', $catalogProductName);
    }

    private function supplierBaseContainsPourLineWords(string $supplierBaseProductName): bool
    {
        return (bool) preg_match('/\b(pour\s+homme|pour\s+femme)\b/iu', $supplierBaseProductName);
    }

    /** «For Her / For Him» в названии линии — не то же самое, что «Mandarina Duck». */
    private function catalogNameContainsForHerHimLineSuffix(string $catalogProductName): bool
    {
        return (bool) preg_match('/\bfor\s+(?:her|him)\b/iu', $catalogProductName);
    }

    private function supplierBaseContainsForHerHimLineWords(string $supplierBaseProductName): bool
    {
        return (bool) preg_match('/\bfor\s+(?:her|him)\b/iu', $supplierBaseProductName);
    }

    /**
     * @param  list<string>  $supplier
     * @param  list<string>  $catalog
     */
    private function productMatchIsGenderCanonOnly(array $supplier, array $catalog): bool
    {
        if ($supplier === [] || $catalog === []) {
            return false;
        }

        $supplierHasSubstantive = false;
        foreach ($supplier as $token) {
            if (! CatalogProductLinkNameTokenizer::isGenderCanonToken((string) $token)) {
                $supplierHasSubstantive = true;
                break;
            }
        }

        $catalogHasSubstantive = false;
        foreach ($catalog as $token) {
            if (! CatalogProductLinkNameTokenizer::isGenderCanonToken((string) $token)) {
                $catalogHasSubstantive = true;
                break;
            }
        }

        return ! $supplierHasSubstantive && ! $catalogHasSubstantive;
    }

    /** «Parfum» в названии линии (Missoni Parfum Pour Homme) — не то же самое, что «Pour Homme». */
    private function catalogNameContainsParfumLineWord(string $catalogProductName): bool
    {
        return (bool) preg_match('/\bparfum\b/iu', $catalogProductName);
    }

    private function supplierBaseContainsParfumLineWord(string $supplierBaseProductName): bool
    {
        return (bool) preg_match('/\bparfum\b/iu', $supplierBaseProductName);
    }

    /** «Extrait» в названии линии (Rouge Smoking Extrait) — не то же самое, что Rouge Smoking. */
    private function catalogNameContainsExtraitLineWord(string $catalogProductName): bool
    {
        return (bool) preg_match('/\bextrait\b/iu', $catalogProductName);
    }

    private function supplierBaseContainsExtraitLineWord(string $supplierBaseProductName): bool
    {
        return (bool) preg_match('/\bextrait\b/iu', $supplierBaseProductName);
    }

    private function catalogNameContainsShowerGelLineMarker(string $catalogProductName): bool
    {
        return $this->nameContainsShowerGelLineMarker($catalogProductName);
    }

    private function supplierBaseContainsShowerGelLineMarker(string $supplierBaseProductName): bool
    {
        return $this->nameContainsShowerGelLineMarker($supplierBaseProductName);
    }

    private function nameContainsShowerGelLineMarker(string $name): bool
    {
        if (preg_match('/\bs\s*\/\s*g\b/iu', $name)) {
            return true;
        }

        $tokens = CatalogProductLinkNameTokenizer::variantMatchTokens($name, null);

        return in_array(CatalogProductLinkNameTokenizer::TOKEN_LINE_SG, $tokens, true);
    }

    private function catalogNameContainsLaLineMarker(string $catalogProductName): bool
    {
        return $this->nameContainsLaLineMarker($catalogProductName);
    }

    private function supplierBaseContainsLaLineMarker(string $supplierBaseProductName): bool
    {
        return $this->nameContainsLaLineMarker($supplierBaseProductName);
    }

    private function nameContainsLaLineMarker(string $name): bool
    {
        if (preg_match('/\bl\s*\.\s*a\s*\.?\b/iu', $name)) {
            return true;
        }

        $tokens = CatalogProductLinkNameTokenizer::variantMatchTokens($name, null);

        return in_array(CatalogProductLinkNameTokenizer::TOKEN_LINE_LA, $tokens, true);
    }

    private function containsFemaleMarker(string $name): bool
    {
        return (bool) preg_match(
            '/\b(for\s*women|women|woman|lady|ladies|for\s*her|female|жен(?:ский|ская|ское|щин))\b/iu',
            $name
        );
    }

    private function containsMaleMarker(string $name): bool
    {
        return (bool) preg_match(
            '/\b(for\s*men|for\s*man|for\s*him|male|муж(?:ской|ская|ское|чин))\b/iu',
            $name
        );
    }

    private function extractVolume(string $title): ?float
    {
        return $this->parseVolumeFromText($title)['volume'];
    }

    private function extractConcentration(string $title): ?string
    {
        if (preg_match('/\b(extrait de parfum|extrait|edp|edt|edc)\b/iu', $title, $matches)) {
            return $this->normalizeConcentration((string) $matches[1]);
        }

        // parfum/parfume — маркер концентрации после объёма («100ml Parfume») или в хвосте строки.
        // Не матчим «de Parfum» в названии линии до объёма («Pasha de Parfum 100ml»).
        if (preg_match(
            '/\b\d+(?:[.,]\d+)?\s*(?:ml|мл)\b\s+(\p{L}+)/iu',
            $title,
            $matches,
        ) || preg_match(
            '/\b\d+(?:[.,]\d+)?(?:ml|мл)\b\s+(\p{L}+)/iu',
            $title,
            $matches,
        )) {
            $fromAlias = $this->concentrationFromParfumAlias((string) ($matches[1] ?? ''));
            if ($fromAlias !== null) {
                return $fromAlias;
            }
        }

        if (preg_match('/\b(parfum(?:e)?s?)\s*$/iu', trim($title), $matches)) {
            $fromAlias = $this->concentrationFromParfumAlias((string) ($matches[1] ?? ''));

            return $fromAlias;
        }

        return null;
    }

    /**
     * parfum/parfume в хвосте варианта (после объёма) = Extrait De Parfum в каталоге.
     */
    private function concentrationFromParfumAlias(string $token): ?string
    {
        $normalized = Str::lower(trim($token));
        if (! in_array($normalized, ['parfum', 'parfume', 'parfums'], true)) {
            return null;
        }

        return 'extrait de parfum';
    }

    private function extractIsTester(string $title): bool
    {
        return (bool) preg_match('/\b(test|tester|тестер)\b/iu', $title);
    }

    private function extractIsVial(string $title): bool
    {
        return (bool) preg_match('/\bvial\b/iu', $title);
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
            'parfum', 'parfume', 'parfums' => 'parfum',
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

            $normalizedTitle = $this->normalizeText($result);
            $normalizedReplacement = $this->normalizeText($replacement);
            if (
                $normalizedReplacement !== ''
                && Str::startsWith($normalizedTitle, $normalizedReplacement)
            ) {
                continue;
            }

            $replaced = (string) preg_replace(
                '/\b'.preg_quote($pattern, '/').'\b/iu',
                $replacement,
                $result,
                1,
                $count,
            );
            if ($count > 0) {
                $result = $replaced;
            }
        }

        return $result;
    }
}
