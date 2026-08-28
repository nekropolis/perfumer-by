<?php

namespace Modules\Catalog\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSimilarLink;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogProductAttributeIds;

final class SimilarProductsService
{
    private const int SHORTLIST_SIZE = 300;

    private const int DEFAULT_LIMIT = 8;

    private const int WRITE_BATCH_SIZE = 200;

    /** @var array<int, int> */
    private const array GENERATOR_WEIGHTS = [
        CatalogProductAttributeIds::TOP_NOTES_ATTRIBUTE_ID => 3,
        CatalogProductAttributeIds::HEART_NOTES_ATTRIBUTE_ID => 3,
        CatalogProductAttributeIds::BASE_NOTES_ATTRIBUTE_ID => 3,
        CatalogProductAttributeIds::PERFUMER_MAIN_ATTRIBUTE_ID => 8,
        CatalogProductAttributeIds::PERFUMER_ATTRIBUTE_ID => 8,
        CatalogProductAttributeIds::TYPE_ATTRIBUTE_ID => 4,
    ];

    /** @var array<int, list<int>>|null */
    private ?array $postings = null;

    /** @var array<int, int>|null */
    private ?array $weightByOption = null;

    /** @var array<int, true>|null */
    private ?array $eligibleProductIds = null;

    /** @var array<int, array<string, mixed>>|null */
    private ?array $productScalars = null;

    /** @var array<int, list<int>>|null */
    private ?array $sourceOptionsByProduct = null;

    /** @var array<int, list<int>>|null */
    private ?array $expandedOptionIds = null;

    /** @var array<int, int|null>|null */
    private ?array $optionPercentages = null;

    /**
     * @return list<int>
     */
    public function similarProductIds(int $productId, int $limit = self::DEFAULT_LIMIT): array
    {
        $limit = max(1, min($limit, 24));

        return ProductSimilarLink::query()
            ->where('product_id', $productId)
            ->orderBy('position')
            ->limit($limit)
            ->pluck('similar_product_id')
            ->map(static fn ($id): int => (int) $id)
            ->values()
            ->all();
    }

    public function rebuildForProduct(int|Product $productOrId, bool $flushCache = true): int
    {
        $product = $productOrId instanceof Product
            ? $productOrId
            : Product::query()->find($productOrId, ['id', 'slug', 'is_active']);

        if ($product === null) {
            return 0;
        }

        $ids = $this->postings !== null
            ? $this->selectSimilarIdsFromIndex((int) $product->id, self::DEFAULT_LIMIT)
            : $this->selectSimilarIdsForSingleProduct((int) $product->id, self::DEFAULT_LIMIT);

        $this->replaceLinks((int) $product->id, $ids);

        if ($flushCache) {
            app(CatalogApiCacheService::class)->forgetProductSimilarBySlug((string) $product->slug);
        }

        return count($ids);
    }

    /**
     * @return array{updated: int, errors: list<string>}
     */
    public function rebuildAll(int $writeBatchSize = self::WRITE_BATCH_SIZE): array
    {
        $writeBatchSize = max(1, $writeBatchSize);
        $this->loadRebuildContext();

        $updated = 0;
        $errors = [];
        /** @var array<int, list<int>> $pendingWrites */
        $pendingWrites = [];

        try {
            Product::query()
                ->where('is_active', true)
                ->orderBy('id')
                ->select(['id'])
                ->chunkById(50, function (Collection $products) use (
                    &$updated,
                    &$errors,
                    &$pendingWrites,
                    $writeBatchSize,
                ): void {
                    foreach ($products as $product) {
                        $productId = (int) $product->id;

                        try {
                            $pendingWrites[$productId] = $this->selectSimilarIdsFromIndex(
                                $productId,
                                self::DEFAULT_LIMIT,
                            );
                            $updated++;

                            if (count($pendingWrites) >= $writeBatchSize) {
                                $this->replaceLinksBatch($pendingWrites);
                                $pendingWrites = [];
                            }
                        } catch (\Throwable $e) {
                            $errors[] = '#'.$productId.': '.$e->getMessage();
                        }
                    }
                });

            if ($pendingWrites !== []) {
                $this->replaceLinksBatch($pendingWrites);
            }
        } finally {
            $this->clearRebuildContext();
        }

        app(CatalogApiCacheService::class)->bumpVersion();

        return [
            'updated' => $updated,
            'errors' => $errors,
        ];
    }

    /**
     * @return list<int>
     */
    private function selectSimilarIdsForSingleProduct(int $productId, int $limit): array
    {
        $sourceOptions = $this->optionIdsByAttribute($productId);
        $sourceScalar = $this->buildScalarFromOptions($sourceOptions, $productId);
        $expandedSourceOptions = $this->expandSourceOptions($sourceOptions);
        $sourceOptionIds = $this->flattenExpandedGeneratorOptions($expandedSourceOptions);

        if ($sourceOptionIds === []) {
            return [];
        }

        $aromaScores = $this->queryAromaScoresFromSql($productId, $sourceOptionIds);
        if ($aromaScores === []) {
            return [];
        }

        return $this->finalizeSimilarSelection(
            $productId,
            $sourceScalar,
            $sourceOptions,
            $aromaScores,
            $limit,
        );
    }

    /**
     * @return list<int>
     */
    private function selectSimilarIdsFromIndex(int $productId, int $limit): array
    {
        if ($this->postings === null || $this->productScalars === null || $this->sourceOptionsByProduct === null) {
            return [];
        }

        $sourceOptions = $this->sourceOptionsByProduct[$productId] ?? [];
        $sourceScalar = $this->productScalars[$productId] ?? $this->emptyScalar($productId);
        $expandedSourceOptions = $this->expandSourceOptions($sourceOptions);
        $sourceOptionIds = $this->flattenExpandedGeneratorOptions($expandedSourceOptions);

        if ($sourceOptionIds === []) {
            return [];
        }

        $aromaScores = $this->accumulateAromaScores($productId, $sourceOptionIds);
        if ($aromaScores === []) {
            return [];
        }

        return $this->finalizeSimilarSelection(
            $productId,
            $sourceScalar,
            $sourceOptions,
            $aromaScores,
            $limit,
        );
    }

    /**
     * @param  array<int, list<int>>  $sourceOptions
     * @param  array<string, mixed>  $sourceScalar
     * @param  array<int, int>  $aromaScores
     * @return list<int>
     */
    private function finalizeSimilarSelection(
        int $productId,
        array $sourceScalar,
        array $sourceOptions,
        array $aromaScores,
        int $limit,
    ): array {
        $eligible = $this->eligibleProductIds ?? $this->loadEligibleProductIdSet();
        $scalars = $this->productScalars ?? [];

        unset($aromaScores[$productId]);

        $genderByProduct = [];
        if ($this->productScalars === null) {
            $genderByProduct = $this->loadGenderOptionIdsForProducts(array_keys($aromaScores));
        }

        $shortlist = [];
        foreach ($aromaScores as $candidateId => $aromaScore) {
            if (! isset($eligible[$candidateId])) {
                continue;
            }

            $candidateGenderScalar = $scalars[$candidateId] ?? [
                'gender_option_id' => $genderByProduct[$candidateId] ?? null,
            ];

            if (! $this->passesGenderFilter($sourceScalar, $candidateGenderScalar)) {
                continue;
            }

            $shortlist[$candidateId] = $aromaScore;
        }

        if ($shortlist === []) {
            return [];
        }

        arsort($shortlist);
        $shortlist = array_slice($shortlist, 0, self::SHORTLIST_SIZE, true);

        if ($this->productScalars === null) {
            $scalars = array_replace($scalars, $this->loadScalarsForProducts(array_keys($shortlist)));
        }

        $candidateOptionsMap = $this->sourceOptionsByProduct;
        if ($candidateOptionsMap === null) {
            $candidateOptionsMap = $this->optionIdsByAttributeForProducts(array_keys($shortlist));
        }

        $scored = [];
        foreach ($shortlist as $candidateId => $aromaScore) {
            $candidateScalar = $scalars[$candidateId] ?? $this->emptyScalar($candidateId);
            $candidateOptions = $candidateOptionsMap[$candidateId] ?? [];

            $scored[] = [
                'id' => $candidateId,
                'score' => $this->finalScore(
                    $aromaScore,
                    $sourceScalar,
                    $candidateScalar,
                    $sourceOptions,
                    $candidateOptions,
                ),
                'price' => $candidateScalar['listing_min_price'],
                'brand_id' => $candidateScalar['brand_id'],
                'is_unisex' => $this->isUnisex($candidateScalar),
            ];
        }

        usort($scored, function (array $a, array $b): int {
            $cmp = $b['score'] <=> $a['score'];
            if ($cmp !== 0) {
                return $cmp;
            }

            $priceA = $a['price'] ?? '999999999';
            $priceB = $b['price'] ?? '999999999';
            $priceCmp = strcmp((string) $priceA, (string) $priceB);
            if ($priceCmp !== 0) {
                return $priceCmp;
            }

            return $a['id'] <=> $b['id'];
        });

        return $this->applyDiversityLimits($scored, $limit);
    }

    /**
     * @param  list<array{id: int, score: int, price: string|null, brand_id: int|null, is_unisex: bool}>  $scored
     * @return list<int>
     */
    private function applyDiversityLimits(array $scored, int $limit): array
    {
        $selected = [];
        /** @var array<int, int> $brandCounts */
        $brandCounts = [];
        $unisexCount = 0;

        foreach ($scored as $row) {
            if (count($selected) >= $limit) {
                break;
            }

            $brandId = $row['brand_id'];
            if ($brandId !== null && ($brandCounts[$brandId] ?? 0) >= 3) {
                continue;
            }

            if ($row['is_unisex'] && $unisexCount >= 3) {
                continue;
            }

            $selected[] = $row['id'];

            if ($brandId !== null) {
                $brandCounts[$brandId] = ($brandCounts[$brandId] ?? 0) + 1;
            }

            if ($row['is_unisex']) {
                $unisexCount++;
            }
        }

        return $selected;
    }

    /**
     * @param  array<int, list<int>>  $sourceOptions
     * @param  array<int, list<int>>  $candidateOptions
     */
    private function finalScore(
        int $aromaScore,
        array $sourceScalar,
        array $candidateScalar,
        array $sourceOptions,
        array $candidateOptions,
    ): int {
        $score = $aromaScore;

        $sourceBrandId = $sourceScalar['brand_id'];
        $candidateBrandId = $candidateScalar['brand_id'];
        if ($sourceBrandId !== null && $sourceBrandId === $candidateBrandId) {
            $score += 20;
        }

        $score += $this->priceProximityBonus(
            $sourceScalar['listing_min_price'],
            $candidateScalar['listing_min_price'],
        );

        $score += $this->percentageProximityBonus(
            $sourceScalar['longevity_pct'],
            $candidateScalar['longevity_pct'],
        );

        $score += $this->percentageProximityBonus(
            $sourceScalar['sillage_pct'],
            $candidateScalar['sillage_pct'],
        );

        if ($this->hasAnyOverlap(
            $sourceOptions[CatalogProductAttributeIds::FRAGRANCE_FAMILY_ATTRIBUTE_ID] ?? [],
            $candidateOptions[CatalogProductAttributeIds::FRAGRANCE_FAMILY_ATTRIBUTE_ID] ?? [],
        )) {
            $score += 5;
        }

        if ($this->hasAnyOverlap(
            $sourceOptions[CatalogProductAttributeIds::SEASON_ATTRIBUTE_ID] ?? [],
            $candidateOptions[CatalogProductAttributeIds::SEASON_ATTRIBUTE_ID] ?? [],
        )) {
            $score += 3;
        }

        if ($this->hasAnyOverlap(
            $sourceOptions[CatalogProductAttributeIds::TIME_OF_DAY_ATTRIBUTE_ID] ?? [],
            $candidateOptions[CatalogProductAttributeIds::TIME_OF_DAY_ATTRIBUTE_ID] ?? [],
        )) {
            $score += 3;
        }

        $sourceYear = $sourceScalar['creation_year'];
        $candidateYear = $candidateScalar['creation_year'];
        if ($sourceYear !== null && $sourceYear === $candidateYear) {
            $score += 2;
        }

        if ($this->isUnisex($candidateScalar) && ! $this->isUnisex($sourceScalar)) {
            $score -= 30;
        }

        return $score;
    }

    private function priceProximityBonus(?string $sourcePrice, ?string $candidatePrice): int
    {
        if ($sourcePrice === null || $candidatePrice === null || bccomp($sourcePrice, '0', 2) <= 0) {
            return 0;
        }

        $ratio = bcdiv($candidatePrice, $sourcePrice, 4);
        if (bccomp($ratio, '0.90', 4) >= 0 && bccomp($ratio, '1.10', 4) <= 0) {
            return 15;
        }

        if (bccomp($ratio, '0.75', 4) >= 0 && bccomp($ratio, '1.25', 4) <= 0) {
            return 10;
        }

        if (bccomp($ratio, '0.50', 4) >= 0 && bccomp($ratio, '1.50', 4) <= 0) {
            return 5;
        }

        return 0;
    }

    private function percentageProximityBonus(?int $sourcePct, ?int $candidatePct): int
    {
        if ($sourcePct === null || $candidatePct === null) {
            return 0;
        }

        $diff = abs($sourcePct - $candidatePct);
        if ($diff <= 10) {
            return 5;
        }

        if ($diff <= 25) {
            return 3;
        }

        return 0;
    }

    /**
     * @param  array<string, mixed>  $sourceScalar
     * @param  array<string, mixed>  $candidateScalar
     */
    private function passesGenderFilter(array $sourceScalar, array $candidateScalar): bool
    {
        $sourceGender = $sourceScalar['gender_option_id'];
        if ($sourceGender === null) {
            return true;
        }

        $candidateGender = $candidateScalar['gender_option_id'];
        if ($candidateGender === null) {
            return false;
        }

        if ($sourceGender === CatalogProductAttributeIds::GENDER_OPTION_UNISEX_ID) {
            return true;
        }

        if ($candidateGender === $sourceGender) {
            return true;
        }

        if ($candidateGender === CatalogProductAttributeIds::GENDER_OPTION_UNISEX_ID) {
            return true;
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $scalar
     */
    private function isUnisex(array $scalar): bool
    {
        return ($scalar['gender_option_id'] ?? null) === CatalogProductAttributeIds::GENDER_OPTION_UNISEX_ID;
    }

    /**
     * @param  list<int>  $sourceOptionIds
     * @return array<int, int>
     */
    private function queryAromaScoresFromSql(int $excludeProductId, array $sourceOptionIds): array
    {
        $generatorIds = CatalogProductAttributeIds::similarGeneratorAttributeIds();
        $optionPlaceholders = implode(',', array_fill(0, count($sourceOptionIds), '?'));
        $attrPlaceholders = implode(',', array_fill(0, count($generatorIds), '?'));

        $caseParts = [];
        foreach (self::GENERATOR_WEIGHTS as $attrId => $weight) {
            $caseParts[] = 'WHEN '.$attrId.' THEN '.$weight;
        }
        $caseSql = 'CASE pav.product_attribute_id '.implode(' ', $caseParts).' ELSE 0 END';

        $rows = DB::select(
            'SELECT pav.product_id AS cid, SUM('.$caseSql.') AS score
             FROM product_attribute_value_options AS pavo
             INNER JOIN product_attribute_values AS pav ON pav.id = pavo.product_attribute_value_id
             WHERE pavo.product_attribute_option_id IN ('.$optionPlaceholders.')
               AND pav.product_attribute_id IN ('.$attrPlaceholders.')
               AND pav.product_id <> ?
             GROUP BY pav.product_id
             ORDER BY score DESC, pav.product_id DESC
             LIMIT '.self::SHORTLIST_SIZE,
            [...$sourceOptionIds, ...$generatorIds, $excludeProductId],
        );

        $scores = [];
        foreach ($rows as $row) {
            $scores[(int) $row->cid] = (int) $row->score;
        }

        return $scores;
    }

    /**
     * @param  list<int>  $sourceOptionIds
     * @return array<int, int>
     */
    private function accumulateAromaScores(int $excludeProductId, array $sourceOptionIds): array
    {
        if ($this->postings === null || $this->weightByOption === null) {
            return [];
        }

        /** @var array<int, int> $scores */
        $scores = [];

        foreach ($sourceOptionIds as $optionId) {
            $weight = $this->weightByOption[$optionId] ?? 0;
            if ($weight === 0) {
                continue;
            }

            foreach ($this->postings[$optionId] ?? [] as $candidateId) {
                if ($candidateId === $excludeProductId) {
                    continue;
                }

                $scores[$candidateId] = ($scores[$candidateId] ?? 0) + $weight;
            }
        }

        return $scores;
    }

    /**
     * @param  array<int, list<int>>  $sourceOptions
     * @return array<int, list<int>>
     */
    private function expandSourceOptions(array $sourceOptions): array
    {
        if ($this->expandedOptionIds === null) {
            $this->loadPerfumerBridge();
        }

        $expanded = $sourceOptions;

        foreach ([
            CatalogProductAttributeIds::PERFUMER_MAIN_ATTRIBUTE_ID,
            CatalogProductAttributeIds::PERFUMER_ATTRIBUTE_ID,
        ] as $attrId) {
            $optionIds = $sourceOptions[$attrId] ?? [];
            if ($optionIds === []) {
                continue;
            }

            $merged = [];
            foreach ($optionIds as $optionId) {
                foreach ($this->expandedOptionIds[$optionId] ?? [$optionId] as $expandedId) {
                    $merged[] = $expandedId;
                }
            }

            $expanded[$attrId] = array_values(array_unique($merged));
        }

        return $expanded;
    }

    /**
     * @param  array<int, list<int>>  $sourceOptions
     * @return list<int>
     */
    private function flattenExpandedGeneratorOptions(array $sourceOptions): array
    {
        $optionIds = [];

        foreach (CatalogProductAttributeIds::similarGeneratorAttributeIds() as $attrId) {
            foreach ($sourceOptions[$attrId] ?? [] as $optionId) {
                $optionIds[] = (int) $optionId;
            }
        }

        return array_values(array_unique(array_filter($optionIds, static fn (int $id): bool => $id > 0)));
    }

    private function loadRebuildContext(): void
    {
        $this->loadPerfumerBridge();
        $this->loadOptionPercentages();
        $this->loadInvertedIndex();
        $this->eligibleProductIds = $this->loadEligibleProductIdSet();
        $this->loadProductScalarsAndOptions();
    }

    private function clearRebuildContext(): void
    {
        $this->postings = null;
        $this->weightByOption = null;
        $this->eligibleProductIds = null;
        $this->productScalars = null;
        $this->sourceOptionsByProduct = null;
        $this->expandedOptionIds = null;
        $this->optionPercentages = null;
    }

    private function loadPerfumerBridge(): void
    {
        $rows = DB::table('product_attribute_options')
            ->whereIn('product_attribute_id', [
                CatalogProductAttributeIds::PERFUMER_MAIN_ATTRIBUTE_ID,
                CatalogProductAttributeIds::PERFUMER_ATTRIBUTE_ID,
            ])
            ->select(['id', 'name'])
            ->get();

        /** @var array<string, list<int>> $byName */
        $byName = [];
        foreach ($rows as $row) {
            $name = $this->normalizeOptionName((string) $row->name);
            if ($name === '') {
                continue;
            }

            $byName[$name][] = (int) $row->id;
        }

        /** @var array<int, list<int>> $expanded */
        $expanded = [];
        foreach ($rows as $row) {
            $name = $this->normalizeOptionName((string) $row->name);
            $expanded[(int) $row->id] = $byName[$name] ?? [(int) $row->id];
        }

        $this->expandedOptionIds = $expanded;
    }

    private function loadOptionPercentages(): void
    {
        $rows = DB::table('product_attribute_options')
            ->whereIn('product_attribute_id', [
                CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID,
                CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID,
            ])
            ->select(['id', 'name'])
            ->get();

        /** @var array<int, int|null> $percentages */
        $percentages = [];
        foreach ($rows as $row) {
            $percentages[(int) $row->id] = $this->parsePercentageFromOptionName((string) $row->name);
        }

        $this->optionPercentages = $percentages;
    }

    private function loadInvertedIndex(): void
    {
        /** @var array<int, list<int>> $postings */
        $postings = [];
        /** @var array<int, int> $weightByOption */
        $weightByOption = [];

        DB::table('product_attribute_value_options as pavo')
            ->join('product_attribute_values as pav', 'pav.id', '=', 'pavo.product_attribute_value_id')
            ->whereIn('pav.product_attribute_id', CatalogProductAttributeIds::similarGeneratorAttributeIds())
            ->select(['pavo.product_attribute_option_id as oid', 'pav.product_id as pid', 'pav.product_attribute_id as aid'])
            ->orderBy('pavo.id')
            ->chunk(100000, function (Collection $chunk) use (&$postings, &$weightByOption): void {
                foreach ($chunk as $row) {
                    $optionId = (int) $row->oid;
                    $productId = (int) $row->pid;
                    $postings[$optionId][] = $productId;
                    if (! isset($weightByOption[$optionId])) {
                        $weightByOption[$optionId] = self::GENERATOR_WEIGHTS[(int) $row->aid] ?? 0;
                    }
                }
            });

        $this->postings = $postings;
        $this->weightByOption = $weightByOption;
    }

    /**
     * @return array<int, true>
     */
    private function loadEligibleProductIdSet(): array
    {
        $ids = Product::query()
            ->where('is_active', true)
            ->whereHas('activeVariants', static function ($query): void {
                $query->whereNotNull('price');
            })
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        return array_fill_keys($ids, true);
    }

    private function loadProductScalarsAndOptions(): void
    {
        /** @var array<int, array<string, mixed>> $scalars */
        $scalars = [];
        /** @var array<int, array<int, list<int>>> $options */
        $options = [];

        /** @var array<int, string> $optionNames */
        $optionNames = DB::table('product_attribute_options')
            ->whereIn('product_attribute_id', [
                CatalogProductAttributeIds::CREATION_YEAR_ATTRIBUTE_ID,
                CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID,
                CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID,
            ])
            ->pluck('name', 'id')
            ->all();

        Product::query()
            ->where('is_active', true)
            ->select(['id', 'brand_id', 'listing_min_price'])
            ->orderBy('id')
            ->chunkById(500, function (Collection $products) use (&$scalars): void {
                foreach ($products as $product) {
                    $scalars[(int) $product->id] = [
                        'gender_option_id' => null,
                        'brand_id' => $product->brand_id !== null ? (int) $product->brand_id : null,
                        'listing_min_price' => $product->listing_min_price !== null
                            ? (string) $product->listing_min_price
                            : null,
                        'longevity_pct' => null,
                        'sillage_pct' => null,
                        'creation_year' => null,
                    ];
                }
            });

        DB::table('product_attribute_values as pav')
            ->join('product_attribute_value_options as pavo', 'pavo.product_attribute_value_id', '=', 'pav.id')
            ->join('products as p', 'p.id', '=', 'pav.product_id')
            ->where('p.is_active', true)
            ->whereIn('pav.product_attribute_id', CatalogProductAttributeIds::similarAllAttributeIds())
            ->select([
                'pav.product_id',
                'pav.product_attribute_id',
                'pavo.product_attribute_option_id',
                'pav.sort_order',
                'pavo.id as pavo_id',
            ])
            ->orderBy('pav.product_id')
            ->orderBy('pav.product_attribute_id')
            ->orderBy('pav.sort_order')
            ->orderBy('pavo.id')
            ->chunk(100000, function (Collection $chunk) use (&$scalars, &$options, $optionNames): void {
                foreach ($chunk as $row) {
                    $productId = (int) $row->product_id;
                    $attrId = (int) $row->product_attribute_id;
                    $optionId = (int) $row->product_attribute_option_id;

                    if (! isset($options[$productId])) {
                        $options[$productId] = [];
                    }

                    $options[$productId][$attrId][] = $optionId;

                    if (! isset($scalars[$productId])) {
                        $scalars[$productId] = $this->emptyScalar($productId);
                    }

                    if ($attrId === CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID && $scalars[$productId]['gender_option_id'] === null) {
                        $scalars[$productId]['gender_option_id'] = $optionId;
                    }

                    if ($attrId === CatalogProductAttributeIds::CREATION_YEAR_ATTRIBUTE_ID && $scalars[$productId]['creation_year'] === null) {
                        $yearOption = $optionNames[$optionId] ?? '';
                        if ($yearOption !== '' && preg_match('/(\d{4})/', $yearOption, $match)) {
                            $scalars[$productId]['creation_year'] = (int) $match[1];
                        }
                    }

                    if ($attrId === CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID && $scalars[$productId]['longevity_pct'] === null) {
                        $scalars[$productId]['longevity_pct'] = $this->optionPercentages[$optionId]
                            ?? $this->parsePercentageFromOptionName($optionNames[$optionId] ?? '');
                    }

                    if ($attrId === CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID && $scalars[$productId]['sillage_pct'] === null) {
                        $scalars[$productId]['sillage_pct'] = $this->optionPercentages[$optionId]
                            ?? $this->parsePercentageFromOptionName($optionNames[$optionId] ?? '');
                    }
                }
            });

        $this->productScalars = $scalars;
        $this->sourceOptionsByProduct = $options;
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyScalar(int $productId): array
    {
        return [
            'gender_option_id' => null,
            'brand_id' => null,
            'listing_min_price' => null,
            'longevity_pct' => null,
            'sillage_pct' => null,
            'creation_year' => null,
        ];
    }

    /**
     * @param  array<int, list<int>>  $sourceOptions
     * @return array<string, mixed>
     */
    private function buildScalarFromOptions(array $sourceOptions, int $productId): array
    {
        $product = Product::query()
            ->whereKey($productId)
            ->first(['id', 'brand_id', 'listing_min_price']);

        $scalar = [
            'gender_option_id' => ($sourceOptions[CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID] ?? [])[0] ?? null,
            'brand_id' => $product?->brand_id !== null ? (int) $product->brand_id : null,
            'listing_min_price' => $product?->listing_min_price !== null ? (string) $product->listing_min_price : null,
            'longevity_pct' => null,
            'sillage_pct' => null,
            'creation_year' => null,
        ];

        $stabilityOptionId = ($sourceOptions[CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID] ?? [])[0] ?? null;
        if ($stabilityOptionId !== null) {
            $scalar['longevity_pct'] = $this->percentageForOptionId((int) $stabilityOptionId);
        }

        $sillageOptionId = ($sourceOptions[CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID] ?? [])[0] ?? null;
        if ($sillageOptionId !== null) {
            $scalar['sillage_pct'] = $this->percentageForOptionId((int) $sillageOptionId);
        }

        $yearOptionId = ($sourceOptions[CatalogProductAttributeIds::CREATION_YEAR_ATTRIBUTE_ID] ?? [])[0] ?? null;
        if ($yearOptionId !== null) {
            $yearName = DB::table('product_attribute_options')->where('id', $yearOptionId)->value('name');
            if (is_string($yearName) && preg_match('/(\d{4})/', $yearName, $match)) {
                $scalar['creation_year'] = (int) $match[1];
            }
        }

        return $scalar;
    }

    private function percentageForOptionId(int $optionId): ?int
    {
        if ($this->optionPercentages === null) {
            $this->loadOptionPercentages();
        }

        if (($this->optionPercentages[$optionId] ?? null) !== null) {
            return $this->optionPercentages[$optionId];
        }

        $name = DB::table('product_attribute_options')->where('id', $optionId)->value('name');

        return is_string($name) ? $this->parsePercentageFromOptionName($name) : null;
    }

    /**
     * @param  list<int>  $productIds
     * @return array<int, int>
     */
    private function loadGenderOptionIdsForProducts(array $productIds): array
    {
        if ($productIds === []) {
            return [];
        }

        $rows = DB::table('product_attribute_values as pav')
            ->join('product_attribute_value_options as pavo', 'pavo.product_attribute_value_id', '=', 'pav.id')
            ->whereIn('pav.product_id', $productIds)
            ->where('pav.product_attribute_id', CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID)
            ->select(['pav.product_id', 'pavo.product_attribute_option_id'])
            ->orderBy('pav.product_id')
            ->orderBy('pav.sort_order')
            ->orderBy('pavo.id')
            ->get();

        /** @var array<int, int> $out */
        $out = [];
        foreach ($rows as $row) {
            $productId = (int) $row->product_id;
            if (! isset($out[$productId])) {
                $out[$productId] = (int) $row->product_attribute_option_id;
            }
        }

        return $out;
    }

    /**
     * @param  list<int>  $productIds
     * @return array<int, array<string, mixed>>
     */
    private function loadScalarsForProducts(array $productIds): array
    {
        if ($productIds === []) {
            return [];
        }

        if ($this->optionPercentages === null) {
            $this->loadOptionPercentages();
        }

        /** @var array<int, string> $optionNames */
        $optionNames = DB::table('product_attribute_options')
            ->whereIn('product_attribute_id', [
                CatalogProductAttributeIds::CREATION_YEAR_ATTRIBUTE_ID,
                CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID,
                CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID,
            ])
            ->pluck('name', 'id')
            ->all();

        $products = Product::query()
            ->whereIn('id', $productIds)
            ->get(['id', 'brand_id', 'listing_min_price'])
            ->keyBy('id');

        $optionsByProduct = $this->optionIdsByAttributeForProducts($productIds);

        /** @var array<int, array<string, mixed>> $out */
        $out = [];
        foreach ($productIds as $productId) {
            $product = $products->get($productId);
            $options = $optionsByProduct[$productId] ?? [];

            $scalar = [
                'gender_option_id' => ($options[CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID] ?? [])[0] ?? null,
                'brand_id' => $product?->brand_id !== null ? (int) $product->brand_id : null,
                'listing_min_price' => $product?->listing_min_price !== null ? (string) $product->listing_min_price : null,
                'longevity_pct' => null,
                'sillage_pct' => null,
                'creation_year' => null,
            ];

            $stabilityOptionId = ($options[CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID] ?? [])[0] ?? null;
            if ($stabilityOptionId !== null) {
                $scalar['longevity_pct'] = $this->optionPercentages[$stabilityOptionId]
                    ?? $this->parsePercentageFromOptionName($optionNames[$stabilityOptionId] ?? '');
            }

            $sillageOptionId = ($options[CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID] ?? [])[0] ?? null;
            if ($sillageOptionId !== null) {
                $scalar['sillage_pct'] = $this->optionPercentages[$sillageOptionId]
                    ?? $this->parsePercentageFromOptionName($optionNames[$sillageOptionId] ?? '');
            }

            $yearOptionId = ($options[CatalogProductAttributeIds::CREATION_YEAR_ATTRIBUTE_ID] ?? [])[0] ?? null;
            if ($yearOptionId !== null) {
                $yearName = $optionNames[$yearOptionId] ?? '';
                if ($yearName !== '' && preg_match('/(\d{4})/', $yearName, $match)) {
                    $scalar['creation_year'] = (int) $match[1];
                }
            }

            $out[$productId] = $scalar;
        }

        return $out;
    }

    /**
     * @return array<int, list<int>>
     */
    private function optionIdsByAttribute(int $productId): array
    {
        $rows = DB::table('product_attribute_values as pav')
            ->join('product_attribute_value_options as pavo', 'pavo.product_attribute_value_id', '=', 'pav.id')
            ->where('pav.product_id', $productId)
            ->whereIn('pav.product_attribute_id', CatalogProductAttributeIds::similarAllAttributeIds())
            ->select([
                'pav.product_attribute_id',
                'pavo.product_attribute_option_id',
                'pav.sort_order',
                'pavo.id as pavo_id',
            ])
            ->orderBy('pav.product_attribute_id')
            ->orderBy('pav.sort_order')
            ->orderBy('pavo.id')
            ->get();

        /** @var array<int, list<int>> $out */
        $out = [];
        foreach ($rows as $row) {
            $attrId = (int) $row->product_attribute_id;
            $optionId = (int) $row->product_attribute_option_id;
            if ($optionId <= 0) {
                continue;
            }

            $out[$attrId][] = $optionId;
        }

        foreach ($out as $attrId => $ids) {
            $out[$attrId] = array_values(array_unique($ids));
        }

        return $out;
    }

    /**
     * @param  list<int>  $productIds
     * @return array<int, array<int, list<int>>>
     */
    private function optionIdsByAttributeForProducts(array $productIds): array
    {
        if ($productIds === []) {
            return [];
        }

        $rows = DB::table('product_attribute_values as pav')
            ->join('product_attribute_value_options as pavo', 'pavo.product_attribute_value_id', '=', 'pav.id')
            ->whereIn('pav.product_id', $productIds)
            ->whereIn('pav.product_attribute_id', CatalogProductAttributeIds::similarAllAttributeIds())
            ->select([
                'pav.product_id',
                'pav.product_attribute_id',
                'pavo.product_attribute_option_id',
                'pav.sort_order',
                'pavo.id as pavo_id',
            ])
            ->orderBy('pav.product_id')
            ->orderBy('pav.product_attribute_id')
            ->orderBy('pav.sort_order')
            ->orderBy('pavo.id')
            ->get();

        /** @var array<int, array<int, list<int>>> $out */
        $out = [];
        foreach ($rows as $row) {
            $productId = (int) $row->product_id;
            $attrId = (int) $row->product_attribute_id;
            $optionId = (int) $row->product_attribute_option_id;
            if ($optionId <= 0) {
                continue;
            }

            $out[$productId][$attrId][] = $optionId;
        }

        foreach ($out as $productId => $attrs) {
            foreach ($attrs as $attrId => $ids) {
                $out[$productId][$attrId] = array_values(array_unique($ids));
            }
        }

        return $out;
    }

    /**
     * @param  list<int>  $similarIds
     */
    private function replaceLinks(int $productId, array $similarIds): void
    {
        DB::transaction(function () use ($productId, $similarIds): void {
            ProductSimilarLink::query()->where('product_id', $productId)->delete();

            if ($similarIds === []) {
                return;
            }

            $rows = [];
            foreach (array_values($similarIds) as $index => $similarId) {
                $rows[] = [
                    'product_id' => $productId,
                    'similar_product_id' => $similarId,
                    'position' => $index + 1,
                ];
            }

            ProductSimilarLink::query()->insert($rows);
        });
    }

    /**
     * @param  array<int, list<int>>  $linksByProductId
     */
    private function replaceLinksBatch(array $linksByProductId): void
    {
        if ($linksByProductId === []) {
            return;
        }

        DB::transaction(function () use ($linksByProductId): void {
            ProductSimilarLink::query()
                ->whereIn('product_id', array_keys($linksByProductId))
                ->delete();

            $rows = [];
            foreach ($linksByProductId as $productId => $similarIds) {
                foreach (array_values($similarIds) as $index => $similarId) {
                    $rows[] = [
                        'product_id' => $productId,
                        'similar_product_id' => $similarId,
                        'position' => $index + 1,
                    ];
                }
            }

            foreach (array_chunk($rows, 1000) as $chunk) {
                ProductSimilarLink::query()->insert($chunk);
            }
        });
    }

    /**
     * @param  list<int>  $left
     * @param  list<int>  $right
     */
    private function hasAnyOverlap(array $left, array $right): bool
    {
        if ($left === [] || $right === []) {
            return false;
        }

        return count(array_intersect($left, $right)) > 0;
    }

    private function normalizeOptionName(string $name): string
    {
        return mb_strtolower(trim($name));
    }

    private function parsePercentageFromOptionName(string $name): ?int
    {
        if (preg_match('/(\d+)\s*%/', $name, $match)) {
            return (int) $match[1];
        }

        return null;
    }
}
