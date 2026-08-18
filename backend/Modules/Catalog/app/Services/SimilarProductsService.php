<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSimilarLink;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogProductAttributeIds;

final class SimilarProductsService
{
    private const int CANDIDATE_POOL = 60;

    private const int DEFAULT_LIMIT = 8;

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

    public function rebuildForProduct(int $productId): int
    {
        $product = Product::query()->find($productId, ['id', 'slug', 'is_active']);
        if ($product === null) {
            return 0;
        }

        $ids = $this->selectSimilarIds($product, self::DEFAULT_LIMIT);
        $this->replaceLinks((int) $product->id, $ids);

        app(CatalogApiCacheService::class)->forgetProductSimilarBySlug((string) $product->slug);

        return count($ids);
    }

    /**
     * @return list<int>
     */
    private function selectSimilarIds(Product $product, int $limit): array
    {
        $sourceOptions = $this->optionIdsByAttribute((int) $product->id);
        $genderIds = $sourceOptions[CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID] ?? [];
        if ($genderIds === []) {
            return [];
        }

        $typeIds = $sourceOptions[CatalogProductAttributeIds::TYPE_ATTRIBUTE_ID] ?? [];
        $candidates = $this->queryCandidatePool((int) $product->id, $genderIds, $typeIds)->get();
        if ($candidates->isEmpty()) {
            return [];
        }

        $candidateOptionMap = [];
        foreach ($candidates as $candidate) {
            $candidateOptionMap[(int) $candidate->id] = $this->optionIdsFromLoaded($candidate);
        }

        $scored = $candidates->map(function (Product $candidate) use ($sourceOptions, $candidateOptionMap, $typeIds): array {
            $candOptions = $candidateOptionMap[(int) $candidate->id] ?? [];

            return [
                'id' => (int) $candidate->id,
                'keys' => $this->scoreKeys($sourceOptions, $candOptions, $typeIds),
            ];
        });

        return $scored
            ->sort(function (array $a, array $b): int {
                foreach ($a['keys'] as $index => $key) {
                    $cmp = $b['keys'][$index] <=> $key;
                    if ($cmp !== 0) {
                        return $cmp;
                    }
                }

                return $b['id'] <=> $a['id'];
            })
            ->pluck('id')
            ->take($limit)
            ->values()
            ->all();
    }

    /**
     * @param  array<int, list<int>>  $sourceOptions
     * @param  array<int, list<int>>  $candidateOptions
     * @param  list<int>  $typeIds
     * @return list<int>
     */
    private function scoreKeys(array $sourceOptions, array $candidateOptions, array $typeIds): array
    {
        $typeScore = 0;
        if ($typeIds !== []) {
            $typeScore = $this->hasAnyOverlap($typeIds, $candidateOptions[CatalogProductAttributeIds::TYPE_ATTRIBUTE_ID] ?? []) ? 1 : 0;
        }

        $seasonIds = $sourceOptions[CatalogProductAttributeIds::SEASON_ATTRIBUTE_ID] ?? [];
        $timeIds = $sourceOptions[CatalogProductAttributeIds::TIME_OF_DAY_ATTRIBUTE_ID] ?? [];
        $perfumerIds = $sourceOptions[CatalogProductAttributeIds::PERFUMER_ATTRIBUTE_ID] ?? [];

        $noteLevel = 0;
        foreach (CatalogProductAttributeIds::similarNoteAttributeIds() as $attrId) {
            $sourceNoteIds = $sourceOptions[$attrId] ?? [];
            if ($sourceNoteIds === []) {
                continue;
            }
            $noteLevel = max(
                $noteLevel,
                $this->multiMatchLevel($sourceNoteIds, $candidateOptions[$attrId] ?? []),
            );
        }

        return [
            $typeScore,
            $this->multiMatchLevel($perfumerIds, $candidateOptions[CatalogProductAttributeIds::PERFUMER_ATTRIBUTE_ID] ?? []),
            ($seasonIds !== [] && $this->hasAnyOverlap($seasonIds, $candidateOptions[CatalogProductAttributeIds::SEASON_ATTRIBUTE_ID] ?? [])) ? 1 : 0,
            ($timeIds !== [] && $this->hasAnyOverlap($timeIds, $candidateOptions[CatalogProductAttributeIds::TIME_OF_DAY_ATTRIBUTE_ID] ?? [])) ? 1 : 0,
            $noteLevel,
        ];
    }

    /**
     * @param  list<int>  $sourceOrderedIds
     * @param  list<int>  $candidateIds
     */
    private function multiMatchLevel(array $sourceOrderedIds, array $candidateIds): int
    {
        if ($sourceOrderedIds === []) {
            return 0;
        }

        $candidateSet = array_flip($candidateIds);
        if ($this->allPresent($sourceOrderedIds, $candidateSet)) {
            return 3;
        }

        $first3 = array_slice($sourceOrderedIds, 0, 3);
        if (count($first3) === 3 && $this->allPresent($first3, $candidateSet)) {
            return 2;
        }

        $first2 = array_slice($sourceOrderedIds, 0, 2);
        if (count($first2) === 2 && $this->allPresent($first2, $candidateSet)) {
            return 1;
        }

        return 0;
    }

    /**
     * @param  list<int>  $ids
     * @param  array<int, int>  $set
     */
    private function allPresent(array $ids, array $set): bool
    {
        foreach ($ids as $id) {
            if (! isset($set[$id])) {
                return false;
            }
        }

        return true;
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

    /**
     * @param  list<int>  $genderIds
     * @param  list<int>  $typeIds
     * @return Builder<Product>
     */
    private function queryCandidatePool(int $excludeId, array $genderIds, array $typeIds): Builder
    {
        $query = Product::query()
            ->where('is_active', true)
            ->whereKeyNot($excludeId)
            ->whereHas('activeVariants', static function ($q): void {
                $q->whereNotNull('price');
            })
            ->where(function (Builder $outer) use ($genderIds): void {
                $this->whereHasAttributeOptions($outer, CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID, $genderIds);
            })
            ->select(['id'])
            ->with([
                'attributeValues' => static function ($q): void {
                    $q->select('id', 'product_id', 'product_attribute_id', 'sort_order')
                        ->whereIn('product_attribute_id', CatalogProductAttributeIds::similarAllAttributeIds())
                        ->with([
                            'selectedOptions' => static function ($sq): void {
                                $sq->select('id', 'product_attribute_value_id', 'product_attribute_option_id');
                            },
                        ]);
                },
            ]);

        if ($typeIds !== []) {
            $placeholders = implode(',', array_fill(0, count($typeIds), '?'));
            $query->orderByRaw(
                'EXISTS (
                    SELECT 1
                    FROM product_attribute_values AS pav
                    INNER JOIN product_attribute_value_options AS pavo
                        ON pavo.product_attribute_value_id = pav.id
                    WHERE pav.product_id = products.id
                        AND pav.product_attribute_id = ?
                        AND pavo.product_attribute_option_id IN ('.$placeholders.')
                ) DESC',
                [CatalogProductAttributeIds::TYPE_ATTRIBUTE_ID, ...$typeIds]
            );
        }

        return $query->orderByDesc('id')->limit(self::CANDIDATE_POOL);
    }

    /**
     * @param  list<int>  $optionIds
     */
    private function whereHasAttributeOptions(Builder $query, int $attributeId, array $optionIds): void
    {
        $query->whereExists(function ($subQuery) use ($attributeId, $optionIds): void {
            $subQuery->selectRaw('1')
                ->from('product_attribute_values as pav')
                ->join(
                    'product_attribute_value_options as pavo',
                    'pavo.product_attribute_value_id',
                    '=',
                    'pav.id'
                )
                ->whereColumn('pav.product_id', 'products.id')
                ->where('pav.product_attribute_id', $attributeId)
                ->whereIn('pavo.product_attribute_option_id', $optionIds);
        });
    }

    /**
     * @return array<int, list<int>>
     */
    private function optionIdsByAttribute(int $productId): array
    {
        $product = Product::query()
            ->whereKey($productId)
            ->with([
                'attributeValues' => static function ($q): void {
                    $q->select('id', 'product_id', 'product_attribute_id', 'sort_order')
                        ->whereIn('product_attribute_id', CatalogProductAttributeIds::similarAllAttributeIds())
                        ->orderBy('sort_order')
                        ->with([
                            'selectedOptions' => static function ($sq): void {
                                $sq->select('id', 'product_attribute_value_id', 'product_attribute_option_id');
                            },
                        ]);
                },
            ])
            ->first(['id']);

        if ($product === null) {
            return [];
        }

        return $this->optionIdsFromLoaded($product);
    }

    /**
     * @return array<int, list<int>>
     */
    private function optionIdsFromLoaded(Product $product): array
    {
        $out = [];
        foreach ($product->attributeValues as $value) {
            $attrId = (int) $value->product_attribute_id;
            $ids = [];
            foreach ($value->selectedOptions as $option) {
                $ids[] = (int) $option->product_attribute_option_id;
            }
            $ids = array_values(array_unique(array_filter($ids, static fn (int $id): bool => $id > 0)));
            if ($ids !== []) {
                $out[$attrId] = $ids;
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

            foreach (array_values($similarIds) as $index => $similarId) {
                ProductSimilarLink::query()->create([
                    'product_id' => $productId,
                    'similar_product_id' => $similarId,
                    'position' => $index + 1,
                ]);
            }
        });
    }
}
