<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductAttribute;

/**
 * Подбор «похожих» товаров по скорингу (бренд, категория, фильтруемые атрибуты, объём, цена, наличие).
 * Не ручная привязка — единый алгоритм для парфюмерной витрины.
 */
final class SimilarProductsService
{
    private const int CANDIDATE_POOL = 180;

    private const int DEFAULT_LIMIT = 8;

    // -------------------------------------------------------------------------
    // Скоринг «похожих» — меняйте веса здесь (целые очки).
    // -------------------------------------------------------------------------
    private const int SCORE_SAME_BRAND = 80;

    private const int SCORE_SAME_MAIN_CATEGORY = 60;

    /** Вклад совпадения по filterable-атрибутам: Jaccard по опциям × этот коэффициент. */
    private const int SCORE_FILTERABLE_JACCARD_WEIGHT = 28;

    /** Доп. вклад за долю пересечения с исходным набором опций (0..1). */
    private const int SCORE_FILTERABLE_COVERAGE_WEIGHT = 6;

    /** Если у обоих есть concentration_code и есть пересечение кодов. */
    private const int SCORE_CONCENTRATION_OVERLAP = 18;

    /** Средний объём: min/max отношение ≥ порога → очки (самый близкий порог выигрывает). */
    private const float VOLUME_RATIO_TIGHT = 0.92;

    private const int SCORE_VOLUME_TIGHT = 22;

    private const float VOLUME_RATIO_MID = 0.75;

    private const int SCORE_VOLUME_MID = 14;

    private const float VOLUME_RATIO_LOOSE = 0.5;

    private const int SCORE_VOLUME_LOOSE = 7;

    private const float PRICE_RATIO_TIGHT = 0.88;

    private const int SCORE_PRICE_TIGHT = 20;

    private const float PRICE_RATIO_MID = 0.72;

    private const int SCORE_PRICE_MID = 12;

    private const float PRICE_RATIO_LOOSE = 0.55;

    private const int SCORE_PRICE_LOOSE = 6;

    private const int SCORE_IN_STOCK_OR_PREORDER = 14;

    private const int SCORE_PRODUCT_ACTIVE = 6;

    private const int SCORE_NOT_CURRENT_PRODUCT = 2;

    /** @var list<int>|null */
    private static ?array $filterableAttributeIds = null;

    /**
     * @return Collection<int, Product>
     */
    public function forProduct(Product $product, int $limit = self::DEFAULT_LIMIT): Collection
    {
        $limit = max(1, min($limit, 24));

        if (! $product->relationLoaded('activeVariants')) {
            $product->load([
                'activeVariants' => static function ($q): void {
                    $q->select('id', 'product_id', 'variant_definition_id', 'price', 'old_price', 'is_preorder', 'is_active', 'stock', 'reserved_stock', 'sort_order')
                        ->with(['definition:id,volume_ml,concentration_code']);
                },
            ]);
        }

        if (! $product->relationLoaded('attributeValues')) {
            $product->load([
                'attributeValues' => static function ($q): void {
                    $q->select('id', 'product_id', 'product_attribute_id', 'custom_value', 'sort_order')
                        ->with([
                            'selectedOptions' => static function ($q): void {
                                $q->select('id', 'product_attribute_value_id', 'product_attribute_option_id');
                            },
                        ]);
                },
            ]);
        }

        $profile = $this->buildSourceProfile($product);
        $candidates = $this->queryCandidates($product, $profile)->get();

        if ($candidates->isEmpty()) {
            return collect();
        }

        $scored = $candidates->map(function (Product $candidate) use ($product, $profile): array {
            $optionSets = $this->filterableOptionSetsByAttribute($candidate);

            return [
                'product' => $candidate,
                'score' => $this->score($product, $profile, $candidate, $optionSets),
            ];
        });

        return $scored
            ->sortByDesc('score')
            ->pluck('product')
            ->take($limit)
            ->values();
    }

    /**
     * @return array{
     *   brand_id: int|null,
     *   main_category_id: int|null,
     *   option_ids_by_attr: array<int, list<int>>,
     *   min_price: float|null,
     *   avg_volume_ml: float|null,
     *   concentration_codes: list<string>
     * }
     */
    private function buildSourceProfile(Product $product): array
    {
        $filterableIds = $this->filterableAttributeIds();
        $optionIdsByAttr = [];

        foreach ($product->attributeValues as $value) {
            $attrId = (int) $value->product_attribute_id;
            if (! in_array($attrId, $filterableIds, true)) {
                continue;
            }
            $ids = $value->relationLoaded('selectedOptions')
                ? $value->selectedOptions->pluck('product_attribute_option_id')->map(static fn ($id): int => (int) $id)->unique()->values()->all()
                : [];
            if ($ids !== []) {
                $optionIdsByAttr[$attrId] = $ids;
            }
        }

        $variants = $product->activeVariants;
        $prices = $variants->pluck('price')->filter(static fn ($p) => $p !== null && $p !== '')->map(static fn ($p): float => (float) $p);
        $minPrice = $prices->isNotEmpty() ? (float) $prices->min() : null;

        $volumes = collect();
        $concCodes = [];
        foreach ($variants as $link) {
            $def = $link->relationLoaded('definition') ? $link->definition : null;
            if ($def && $def->volume_ml !== null) {
                $volumes->push((float) $def->volume_ml);
            }
            if ($def && $def->concentration_code) {
                $concCodes[] = mb_strtolower(trim((string) $def->concentration_code));
            }
        }
        $avgVolume = $volumes->isNotEmpty() ? (float) $volumes->avg() : null;
        $concCodes = array_values(array_unique($concCodes));

        return [
            'brand_id' => $product->brand_id ? (int) $product->brand_id : null,
            'main_category_id' => $product->main_category_id ? (int) $product->main_category_id : null,
            'option_ids_by_attr' => $optionIdsByAttr,
            'min_price' => $minPrice,
            'avg_volume_ml' => $avgVolume,
            'concentration_codes' => $concCodes,
        ];
    }

    /**
     * @param  array{
     *   brand_id: int|null,
     *   main_category_id: int|null,
     *   option_ids_by_attr: array<int, list<int>>,
     *   min_price: float|null,
     *   avg_volume_ml: float|null,
     *   concentration_codes: list<string>
     * }  $profile
     * @param  array<int, list<int>>  $candidateOptionSets
     */
    private function score(Product $source, array $profile, Product $candidate, array $candidateOptionSets): int
    {
        $score = 0;

        if ($profile['brand_id'] !== null && (int) $candidate->brand_id === $profile['brand_id']) {
            $score += self::SCORE_SAME_BRAND;
        }

        if ($profile['main_category_id'] !== null && (int) $candidate->main_category_id === $profile['main_category_id']) {
            $score += self::SCORE_SAME_MAIN_CATEGORY;
        }

        foreach ($profile['option_ids_by_attr'] as $attrId => $srcOptions) {
            $candOptions = $candidateOptionSets[$attrId] ?? [];
            $intersect = count(array_intersect($srcOptions, $candOptions));
            if ($intersect > 0) {
                $union = count(array_unique(array_merge($srcOptions, $candOptions)));
                $jaccard = $union > 0 ? $intersect / $union : 0.0;
                $score += (int) round(
                    self::SCORE_FILTERABLE_JACCARD_WEIGHT * $jaccard
                    + self::SCORE_FILTERABLE_COVERAGE_WEIGHT * min(1.0, $intersect / max(1, count($srcOptions)))
                );
            }
        }

        $candConc = $this->candidateConcentrationCodes($candidate);
        if ($profile['concentration_codes'] !== [] && $candConc !== []) {
            $overlap = count(array_intersect($profile['concentration_codes'], $candConc));
            if ($overlap > 0) {
                $score += self::SCORE_CONCENTRATION_OVERLAP;
            }
        }

        if ($profile['avg_volume_ml'] !== null && $profile['avg_volume_ml'] > 0) {
            $candAvg = $this->candidateAvgVolumeMl($candidate);
            if ($candAvg !== null && $candAvg > 0) {
                $ratio = min($profile['avg_volume_ml'], $candAvg) / max($profile['avg_volume_ml'], $candAvg);
                if ($ratio >= self::VOLUME_RATIO_TIGHT) {
                    $score += self::SCORE_VOLUME_TIGHT;
                } elseif ($ratio >= self::VOLUME_RATIO_MID) {
                    $score += self::SCORE_VOLUME_MID;
                } elseif ($ratio >= self::VOLUME_RATIO_LOOSE) {
                    $score += self::SCORE_VOLUME_LOOSE;
                }
            }
        }

        if ($profile['min_price'] !== null && $profile['min_price'] > 0) {
            $candMin = $this->candidateMinPrice($candidate);
            if ($candMin !== null && $candMin > 0) {
                $ratio = min($profile['min_price'], $candMin) / max($profile['min_price'], $candMin);
                if ($ratio >= self::PRICE_RATIO_TIGHT) {
                    $score += self::SCORE_PRICE_TIGHT;
                } elseif ($ratio >= self::PRICE_RATIO_MID) {
                    $score += self::SCORE_PRICE_MID;
                } elseif ($ratio >= self::PRICE_RATIO_LOOSE) {
                    $score += self::SCORE_PRICE_LOOSE;
                }
            }
        }

        $stock = (int) $candidate->activeVariants->sum('stock');
        $preorder = $candidate->activeVariants->where('is_preorder', true)->isNotEmpty();
        if ($stock > 0 || $preorder) {
            $score += self::SCORE_IN_STOCK_OR_PREORDER;
        }

        if ($candidate->is_active) {
            $score += self::SCORE_PRODUCT_ACTIVE;
        }

        if ((int) $candidate->id !== (int) $source->id) {
            $score += self::SCORE_NOT_CURRENT_PRODUCT;
        }

        return $score;
    }

    /**
     * @param  array{
     *   brand_id: int|null,
     *   main_category_id: int|null,
     *   option_ids_by_attr: array<int, list<int>>,
     *   min_price: float|null,
     *   avg_volume_ml: float|null,
     *   concentration_codes: list<string>
     * }  $profile
     */
    private function queryCandidates(Product $product, array $profile): Builder
    {
        $base = $this->similarCandidatesBaseQuery($product);

        $brandId = $profile['brand_id'];
        $catId = $profile['main_category_id'];
        $attrs = $profile['option_ids_by_attr'];

        $hasBrand = $brandId !== null;
        $hasCat = $catId !== null;
        $hasAttr = false;
        foreach ($attrs as $optionIds) {
            if ($optionIds !== []) {
                $hasAttr = true;
                break;
            }
        }

        if (! $hasBrand && ! $hasCat && ! $hasAttr) {
            return $base->orderByDesc('id');
        }

        return $base->where(function (Builder $outer) use ($brandId, $catId, $attrs): void {
            $first = true;

            if ($brandId !== null) {
                $outer->where('brand_id', $brandId);
                $first = false;
            }
            if ($catId !== null) {
                if ($first) {
                    $outer->where('main_category_id', $catId);
                } else {
                    $outer->orWhere('main_category_id', $catId);
                }
                $first = false;
            }
            foreach ($attrs as $attrId => $optionIds) {
                if ($optionIds === []) {
                    continue;
                }

                if ($first) {
                    $outer->whereHas('attributeValues', function ($vq) use ($attrId, $optionIds): void {
                        $vq->where('product_attribute_id', $attrId)
                            ->whereHas('selectedOptions', function ($sq) use ($optionIds): void {
                                $sq->whereIn('product_attribute_option_id', $optionIds);
                            });
                    });
                    $first = false;
                } else {
                    $outer->orWhereHas('attributeValues', function ($vq) use ($attrId, $optionIds): void {
                        $vq->where('product_attribute_id', $attrId)
                            ->whereHas('selectedOptions', function ($sq) use ($optionIds): void {
                                $sq->whereIn('product_attribute_option_id', $optionIds);
                            });
                    });
                }
            }
        });
    }

    private function similarCandidatesBaseQuery(Product $exclude): Builder
    {
        return Product::query()
            ->where('is_active', true)
            ->whereKeyNot($exclude->getKey())
            ->whereHas('activeVariants', static function ($q): void {
                $q->whereNotNull('price');
            })
            ->select([
                'id',
                'brand_id',
                'main_category_id',
                'name',
                'slug',
                'h1',
                'short_description',
                'is_new',
                'is_hit',
                'is_out_of_stock',
                'is_active',
            ])
            ->withCount([
                'activeVariants as in_stock_variants_count' => function ($q) {
                    $q->where('stock', '>', 0);
                },
            ])
            ->with([
                'brand:id,name,slug',
                'mainCategory:id,name,slug',
                'images' => ProductListResource::imagesForListingEagerLoad(),
                'activeVariants' => static function ($q): void {
                    $q->select('id', 'product_id', 'variant_definition_id', 'price', 'old_price', 'is_preorder', 'is_active', 'stock', 'reserved_stock', 'sort_order')
                        ->with([
                            'definition' => static function ($dq): void {
                                $dq->select('id', 'volume_ml', 'concentration_code', 'concentration_label', 'is_tester', 'title');
                            },
                        ]);
                },
                'attributeValues' => function ($q): void {
                    $ids = $this->filterableAttributeIds();
                    $q->select('id', 'product_id', 'product_attribute_id', 'custom_value', 'sort_order')
                        ->whereIn('product_attribute_id', $ids)
                        ->with([
                            'selectedOptions' => static function ($sq): void {
                                $sq->select('id', 'product_attribute_value_id', 'product_attribute_option_id');
                            },
                        ]);
                },
            ])
            ->withMin('activeVariants as min_price', 'price')
            ->limit(self::CANDIDATE_POOL);
    }

    /**
     * @return list<int>
     */
    private function filterableAttributeIds(): array
    {
        if (self::$filterableAttributeIds !== null) {
            return self::$filterableAttributeIds;
        }

        self::$filterableAttributeIds = ProductAttribute::query()
            ->where('is_active', true)
            ->where('is_filterable', true)
            ->orderBy('filter_sort_order')
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->values()
            ->all();

        return self::$filterableAttributeIds;
    }

    /**
     * @return array<int, list<int>>
     */
    private function filterableOptionSetsByAttribute(Product $product): array
    {
        $out = [];
        foreach ($product->attributeValues as $value) {
            $attrId = (int) $value->product_attribute_id;
            if (! $value->relationLoaded('selectedOptions')) {
                continue;
            }
            $ids = $value->selectedOptions->pluck('product_attribute_option_id')->map(static fn ($id): int => (int) $id)->unique()->values()->all();
            if ($ids !== []) {
                $out[$attrId] = $ids;
            }
        }

        return $out;
    }

    /**
     * @return list<string>
     */
    private function candidateConcentrationCodes(Product $product): array
    {
        $codes = [];
        foreach ($product->activeVariants as $link) {
            $def = $link->relationLoaded('definition') ? $link->definition : null;
            if ($def && $def->concentration_code) {
                $codes[] = mb_strtolower(trim((string) $def->concentration_code));
            }
        }

        return array_values(array_unique($codes));
    }

    private function candidateAvgVolumeMl(Product $product): ?float
    {
        $volumes = collect();
        foreach ($product->activeVariants as $link) {
            $def = $link->relationLoaded('definition') ? $link->definition : null;
            if ($def && $def->volume_ml !== null) {
                $volumes->push((float) $def->volume_ml);
            }
        }

        return $volumes->isNotEmpty() ? (float) $volumes->avg() : null;
    }

    private function candidateMinPrice(Product $product): ?float
    {
        $prices = $product->activeVariants->pluck('price')->filter(static fn ($p) => $p !== null && $p !== '')->map(static fn ($p): float => (float) $p);

        return $prices->isNotEmpty() ? (float) $prices->min() : null;
    }
}
