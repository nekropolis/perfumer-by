<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogProductLinkNameTokenizer;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

/**
 * Поиск товара для ручной/полуавтоматической связи с прайсом: AND по значимым токенам,
 * без «рандомного» пула последних id и без раздувания LIKE по обрубкам вроде «red for».
 */
class CatalogProductLinkSearchService
{
    private const int POOL_LIMIT = 220;

    /**
     * Ответ в формате админского smart-search (варианты + score).
     *
     * @return list<array<string, mixed>>
     */
    public function searchForAdminSmart(string $query, ?int $brandIdHint, int $limit): array
    {
        $query = trim($query);
        if (mb_strlen($query, 'UTF-8') < 2) {
            return [];
        }

        $brands = Brand::query()->select(['id', 'name'])->get();
        $brandFilter = $brandIdHint;
        $stripBrandName = null;

        if ($brandFilter !== null && $brandFilter > 0) {
            $hintBrand = $brands->firstWhere('id', $brandFilter);
            $stripBrandName = $hintBrand ? trim((string) $hintBrand->name) : null;
        }

        $split = CatalogProductLinkNameTokenizer::splitLeadingBrand($query, $brands);
        if ($brandFilter === null || $brandFilter <= 0) {
            $brandFilter = $split['brand_id'];
        }

        if ($stripBrandName === null || $stripBrandName === '') {
            $stripBrandName = $split['brand_name'];
        }

        $rest = $query;
        if ($stripBrandName !== null && $stripBrandName !== '') {
            $pattern = '/^'.preg_quote($stripBrandName, '/').'\s+/iu';
            $stripped = trim((string) preg_replace($pattern, '', $query, 1));
            if ($stripped !== '') {
                $rest = $stripped;
            }
        } elseif ($split['rest'] !== '') {
            $rest = $split['rest'];
        }

        $tokens = CatalogProductLinkNameTokenizer::linkSearchTokensFromRest($rest, null);
        $pool = $this->fetchPoolByTokens($tokens, $brandFilter);

        if ($pool->isEmpty()) {
            $pool = $this->fetchPoolByFullNeedle($query, $brandFilter);
        }

        if ($pool->isEmpty()) {
            return [];
        }

        $normalizedQuery = $this->normalizeSearchText($query);
        $eager = $this->adminSmartSearchProductEagerLoads();

        $pool = $pool->map(function (Product $p) use ($eager) {
            return $p->loadMissing($eager);
        });

        [$stocksByVariant, $mainWarehouseId, $supplierWarehouseId] = $this->batchWarehouseStocksByVariantIds(
            $pool->flatMap(static fn (Product $p) => $p->variants->pluck('id'))->unique()->filter()->values()->all()
        );

        $ranked = $pool->map(function (Product $product) use ($normalizedQuery, $stocksByVariant, $mainWarehouseId, $supplierWarehouseId) {
            $name = (string) $product->name;
            $slug = (string) $product->slug;
            $brandName = (string) ($product->brand?->name ?? '');
            $variantTitles = $product->variants?->pluck('title')->filter()->values() ?? collect();
            $variantSlices = collect();
            foreach ($product->variants ?? [] as $link) {
                $d = $link->definition;
                if (! $d) {
                    continue;
                }
                foreach ([$d->title, $d->concentration_label, $d->concentration_code] as $piece) {
                    if ($piece !== null && trim((string) $piece) !== '') {
                        $variantSlices->push((string) $piece);
                    }
                }
            }

            $scoreName = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($name));
            $scoreSlug = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($slug));
            $scoreBrand = $brandName !== '' ? $this->similarityScore($normalizedQuery, $this->normalizeSearchText($brandName)) : 0.0;
            $scoreVariant = $variantSlices->reduce(function (float $carry, string $piece) use ($normalizedQuery) {
                $score = $this->similarityScore($normalizedQuery, $this->normalizeSearchText($piece));

                return max($carry, $score);
            }, 0.0);

            $bestScore = max($scoreName, $scoreSlug * 0.95, $scoreBrand * 0.8, $scoreVariant * 0.9);

            if ($bestScore < 0.10) {
                return null;
            }

            return [
                'id' => (int) $product->id,
                'name' => $name,
                'brand_name' => $brandName !== '' ? $brandName : null,
                'variant_titles' => $variantTitles->values()->all(),
                'variants_preview' => $this->smartSearchVariantLines(
                    $product->variants,
                    $stocksByVariant,
                    $mainWarehouseId,
                    $supplierWarehouseId
                ),
                'score' => round($bestScore, 6),
            ];
        })
            ->filter()
            ->sortByDesc('score')
            ->take($limit)
            ->values()
            ->all();

        return $this->appendAdminSmartSearchSkuAndIdHits($query, $ranked, $limit);
    }

    /**
     * Список товаров в формате админского списка (для Seller One / приходов).
     *
     * @return list<array<string, mixed>>
     */
    public function searchForAdminProductList(string $query, ?int $brandIdHint, int $limit): array
    {
        $query = trim($query);
        if (mb_strlen($query, 'UTF-8') < 2) {
            return [];
        }

        $brands = Brand::query()->select(['id', 'name'])->get();
        $brandFilter = $brandIdHint;
        $stripBrandName = null;

        if ($brandFilter !== null && $brandFilter > 0) {
            $hintBrand = $brands->firstWhere('id', $brandFilter);
            $stripBrandName = $hintBrand ? trim((string) $hintBrand->name) : null;
        }

        $split = CatalogProductLinkNameTokenizer::splitLeadingBrand($query, $brands);
        if ($brandFilter === null || $brandFilter <= 0) {
            $brandFilter = $split['brand_id'];
        }

        if ($stripBrandName === null || $stripBrandName === '') {
            $stripBrandName = $split['brand_name'];
        }

        $rest = $query;
        if ($stripBrandName !== null && $stripBrandName !== '') {
            $pattern = '/^'.preg_quote($stripBrandName, '/').'\s+/iu';
            $stripped = trim((string) preg_replace($pattern, '', $query, 1));
            if ($stripped !== '') {
                $rest = $stripped;
            }
        } elseif ($split['rest'] !== '') {
            $rest = $split['rest'];
        }

        $tokens = CatalogProductLinkNameTokenizer::linkSearchTokensFromRest($rest, null);
        $pool = $this->fetchPoolByTokens($tokens, $brandFilter);

        if ($pool->isEmpty()) {
            $pool = $this->fetchPoolByFullNeedle($query, $brandFilter);
        }

        if ($pool->isEmpty()) {
            return [];
        }

        $normalizedQuery = $this->normalizeSearchText($query);
        $rows = $pool->map(function (Product $product) use ($normalizedQuery) {
            $name = (string) $product->name;
            $brandName = (string) ($product->brand?->name ?? '');
            $full = $this->normalizeSearchText(trim($brandName.' '.$name));
            $score = $this->similarityScore($normalizedQuery, $full);

            return ['product' => $product, 'score' => $score];
        })
            ->sortByDesc('score')
            ->take($limit)
            ->pluck('product');

        return $rows->map(function (Product $product) {
            return [
                'id' => (int) $product->id,
                'name' => (string) $product->name,
                'slug' => (string) $product->slug,
                'is_active' => (bool) $product->is_active,
                'is_new' => (bool) $product->is_new,
                'is_hit' => (bool) $product->is_hit,
                'is_out_of_stock' => (bool) ($product->is_out_of_stock ?? false),
                'variants_count' => (int) ($product->variants_count ?? 0),
                'brand' => $product->brand ? [
                    'id' => (int) $product->brand->id,
                    'name' => (string) $product->brand->name,
                    'slug' => (string) $product->brand->slug,
                ] : null,
            ];
        })->values()->all();
    }

    /**
     * @param  list<string>  $tokens
     * @return Collection<int, Product>
     */
    private function fetchPoolByTokens(array $tokens, ?int $brandId): Collection
    {
        $significant = array_values(array_filter(
            $tokens,
            static fn (string $t): bool => mb_strlen($t, 'UTF-8') >= 2
                && ! CatalogProductLinkNameTokenizer::isGenderCanonToken($t)
        ));

        $hasGender = CatalogProductLinkNameTokenizer::tokensContainGenderCanon($tokens);

        if ($significant === []) {
            return collect();
        }

        $q = Product::query()
            ->select(['id', 'brand_id', 'name', 'slug', 'is_active', 'is_new', 'is_hit', 'is_out_of_stock'])
            ->withCount('variants')
            ->with(['brand:id,name,slug']);

        if ($brandId !== null && $brandId > 0) {
            $q->where('brand_id', $brandId);
        }

        foreach ($significant as $token) {
            $escaped = $this->escapeLikeValue($token);
            $needle = '%'.$escaped.'%';
            $q->where(function ($w) use ($needle): void {
                $w->where('name', 'like', $needle)
                    ->orWhere('slug', 'like', $needle);
            });
        }

        if ($hasGender) {
            $q->where(function ($w) use ($tokens): void {
                $this->applyGenderOrLikesForTokens($w, $tokens);
            });
        }

        return $q->orderByDesc('id')->limit(self::POOL_LIMIT)->get();
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<\Modules\Catalog\Models\Product>  $w
     * @param  list<string>  $tokens
     */
    private function applyGenderOrLikesForTokens($w, array $tokens): void
    {
        $hasF = in_array(CatalogProductLinkNameTokenizer::TOKEN_GF, $tokens, true);
        $hasM = in_array(CatalogProductLinkNameTokenizer::TOKEN_GM, $tokens, true);
        $hasU = in_array(CatalogProductLinkNameTokenizer::TOKEN_GU, $tokens, true);

        $female = ['for women', 'for woman', 'pour femme', 'for her'];
        $male = ['for men', 'for man', 'pour homme', 'for him'];
        $uni = ['unisex'];

        if ($hasF && ! $hasM) {
            $phrases = $female;
        } elseif ($hasM && ! $hasF) {
            $phrases = $male;
        } elseif ($hasU && ! $hasF && ! $hasM) {
            $phrases = $uni;
        } else {
            $phrases = array_merge($female, $male, $uni);
        }

        $w->where(function ($group) use ($phrases): void {
            $first = true;
            foreach ($phrases as $phrase) {
                $escaped = $this->escapeLikeValue($phrase);
                $needle = '%'.$escaped.'%';
                if ($first) {
                    $group->where(function ($sub) use ($needle): void {
                        $sub->where('name', 'like', $needle)->orWhere('slug', 'like', $needle);
                    });
                    $first = false;
                } else {
                    $group->orWhere(function ($sub) use ($needle): void {
                        $sub->where('name', 'like', $needle)->orWhere('slug', 'like', $needle);
                    });
                }
            }
        });
    }

    /**
     * @return Collection<int, Product>
     */
    private function fetchPoolByFullNeedle(string $query, ?int $brandId): Collection
    {
        $escaped = $this->escapeLikeValue($query);
        $needle = '%'.$escaped.'%';

        $q = Product::query()
            ->select(['id', 'brand_id', 'name', 'slug', 'is_active', 'is_new', 'is_hit', 'is_out_of_stock'])
            ->withCount('variants')
            ->with(['brand:id,name,slug'])
            ->where(function ($w) use ($needle): void {
                $w->where('name', 'like', $needle)->orWhere('slug', 'like', $needle);
            });

        if ($brandId !== null && $brandId > 0) {
            $q->where('brand_id', $brandId);
        }

        return $q->orderByDesc('id')->limit(self::POOL_LIMIT)->get();
    }

    private function escapeLikeValue(string $value): string
    {
        return addcslashes($value, '%_\\');
    }

    /**
     * @return array<string, mixed>
     */
    private function adminSmartSearchProductEagerLoads(): array
    {
        return [
            'brand:id,name',
            'variants' => static function ($q): void {
                $q->select(['id', 'product_id', 'variant_definition_id'])
                    ->with(['definition:id,title,concentration_code,concentration_label,volume_ml']);
            },
        ];
    }

    /**
     * @param  list<int>  $variantIds
     * @return array{0: Collection<int, Collection<int, WarehouseVariantStock>>, 1: int, 2: int}
     */
    private function batchWarehouseStocksByVariantIds(array $variantIds): array
    {
        $mainWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_MAIN)->value('id');
        $supplierWarehouseId = (int) Warehouse::query()->where('code', Warehouse::CODE_SUPPLIER)->value('id');

        if ($variantIds === []) {
            return [collect(), $mainWarehouseId, $supplierWarehouseId];
        }

        $rows = WarehouseVariantStock::query()
            ->whereIn('variant_id', $variantIds)
            ->whereIn('warehouse_id', array_filter([$mainWarehouseId, $supplierWarehouseId]))
            ->get();

        return [
            $rows->groupBy('variant_id')->map(static fn ($g) => $g->keyBy('warehouse_id')),
            $mainWarehouseId,
            $supplierWarehouseId,
        ];
    }

    /**
     * @param  iterable<\Modules\Catalog\Models\ProductVariantLink>  $variants
     * @param  Collection<int, Collection<int, WarehouseVariantStock>>  $stocksByVariant
     * @return list<array<string, mixed>>
     */
    private function smartSearchVariantLines(
        iterable $variants,
        Collection $stocksByVariant,
        int $mainWarehouseId,
        int $supplierWarehouseId,
    ): array {
        $out = [];
        foreach ($variants as $link) {
            $byW = $stocksByVariant->get($link->id, collect());
            $mainStock = $mainWarehouseId > 0 ? $byW->get($mainWarehouseId) : null;
            $supplierStock = $supplierWarehouseId > 0 ? $byW->get($supplierWarehouseId) : null;
            $presented = \Modules\Catalog\Support\CatalogVariantStockPresenter::forListing($link, $mainStock, $supplierStock);
            $effectivePrice = \Modules\Catalog\Support\CatalogVariantStockPresenter::storefrontVariantPrice($link, $presented);
            $out[] = [
                'id' => (int) $link->id,
                'title' => (string) $link->title,
                'fulfillment_tooltip' => \Modules\Catalog\Http\Resources\ProductVariantResource::adminFulfillmentTooltip($link, $mainStock, $supplierStock),
                'available_stock' => (int) $presented['available_stock'],
                'is_available' => (bool) $presented['is_available'],
                'is_preorder' => (bool) $presented['is_preorder'],
                'price' => $effectivePrice !== null ? (string) $effectivePrice : null,
            ];
        }

        return $out;
    }

    private function normalizeSearchText(string $value): string
    {
        $value = mb_strtolower($value, 'UTF-8');
        $value = preg_replace('/[^[:alnum:]\s]+/u', ' ', $value) ?? '';
        $value = preg_replace('/\s+/u', ' ', $value) ?? '';

        return trim($value);
    }

    private function similarityScore(string $needle, string $haystack): float
    {
        if ($needle === '' || $haystack === '') {
            return 0.0;
        }
        if ($needle === $haystack) {
            return 1.0;
        }
        if (str_contains($haystack, $needle)) {
            return 0.96;
        }

        $needleTokens = array_values(array_filter(explode(' ', $needle)));
        $haystackTokens = array_values(array_filter(explode(' ', $haystack)));

        $tokenScoreSum = 0.0;
        foreach ($needleTokens as $needleToken) {
            $bestTokenScore = $this->diceCoefficient($needleToken, $haystack);
            foreach ($haystackTokens as $haystackToken) {
                $bestTokenScore = max($bestTokenScore, $this->diceCoefficient($needleToken, $haystackToken));
            }
            $tokenScoreSum += $bestTokenScore;
        }

        $avgTokenScore = $tokenScoreSum / max(1, count($needleTokens));
        $phraseScore = $this->diceCoefficient($needle, $haystack);

        return max($avgTokenScore, $phraseScore * 0.9);
    }

    private function diceCoefficient(string $a, string $b): float
    {
        if ($a === '' || $b === '') {
            return 0.0;
        }
        if ($a === $b) {
            return 1.0;
        }

        $aBigrams = $this->mbBigrams($a);
        $bBigrams = $this->mbBigrams($b);

        if (empty($aBigrams) || empty($bBigrams)) {
            return 0.0;
        }

        $aCounts = array_count_values($aBigrams);
        $bCounts = array_count_values($bBigrams);
        $intersection = 0;

        foreach ($aCounts as $gram => $count) {
            if (! isset($bCounts[$gram])) {
                continue;
            }
            $intersection += min($count, $bCounts[$gram]);
        }

        return (2 * $intersection) / (count($aBigrams) + count($bBigrams));
    }

    /**
     * @return string[]
     */
    private function mbBigrams(string $value): array
    {
        $length = mb_strlen($value, 'UTF-8');
        if ($length < 2) {
            return [];
        }

        $grams = [];
        for ($i = 0; $i < $length - 1; $i++) {
            $grams[] = mb_substr($value, $i, 2, 'UTF-8');
        }

        return $grams;
    }

    /**
     * Поиск в админском списке товаров: «Kenzo Flower By Legere» = бренд + AND по токенам имени.
     *
     * @param  Builder<Product>  $query
     */
    public function applyAdminProductListSearch(Builder $query, string $search): void
    {
        $search = trim($search);
        if ($search === '') {
            return;
        }

        $stem = trim((string) preg_replace('/\s+-\s*.*$/u', '', $search)) ?: $search;
        $isNumericIdSearch = preg_match('/^\d{1,12}$/', $search) === 1 && (int) $search > 0;

        $brands = Brand::query()->select(['id', 'name'])->get();
        $split = CatalogProductLinkNameTokenizer::splitLeadingBrand($search, $brands);
        $brandFilter = $split['brand_id'];
        $stripBrandName = $split['brand_name'];

        $rest = $search;
        if ($stripBrandName !== null && $stripBrandName !== '') {
            $pattern = '/^'.preg_quote($stripBrandName, '/').'\s+/iu';
            $stripped = trim((string) preg_replace($pattern, '', $search, 1));
            if ($stripped !== '') {
                $rest = $stripped;
            }
        } elseif ($split['rest'] !== '') {
            $rest = $split['rest'];
        }

        $tokens = CatalogProductLinkNameTokenizer::linkSearchTokensFromRest($rest, null);
        $significant = array_values(array_filter(
            $tokens,
            static fn (string $t): bool => mb_strlen($t, 'UTF-8') >= 2
                && ! CatalogProductLinkNameTokenizer::isGenderCanonToken($t)
        ));
        $hasGender = CatalogProductLinkNameTokenizer::tokensContainGenderCanon($tokens);
        $useTokenizedPath = $brandFilter !== null || $significant !== [] || $hasGender;

        $query->where(function ($outer) use ($search, $stem, $isNumericIdSearch, $brandFilter, $significant, $hasGender, $tokens, $useTokenizedPath, $rest): void {
            if ($useTokenizedPath) {
                $outer->where(function ($tokenized) use ($brandFilter, $significant, $hasGender, $tokens): void {
                    if ($brandFilter !== null && $brandFilter > 0) {
                        $tokenized->where('brand_id', $brandFilter);
                    }

                    foreach ($significant as $token) {
                        $needle = '%'.$this->escapeLikeValue($token).'%';
                        $tokenized->where(function ($w) use ($needle): void {
                            $this->applyAdminListTokenMatch($w, $needle);
                        });
                    }

                    if ($hasGender) {
                        $tokenized->where(function ($w) use ($tokens): void {
                            $this->applyGenderOrLikesForTokens($w, $tokens);
                        });
                    }
                });
            }

            $outer->orWhere(function ($legacy) use ($search, $stem, $isNumericIdSearch, $brandFilter, $rest): void {
                $legacy->where('name', 'like', "%{$search}%")
                    ->orWhereHas('brand', function ($brandQuery) use ($search, $stem): void {
                        $brandQuery->where('name', 'like', "%{$search}%");
                        if (mb_strtolower($stem, 'UTF-8') !== mb_strtolower($search, 'UTF-8')) {
                            $brandQuery->orWhere('name', 'like', "%{$stem}%");
                        }
                    })
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhereHas('variants.definition', function ($def) use ($search): void {
                        $def->where('title', 'like', "%{$search}%")
                            ->orWhere('concentration_label', 'like', "%{$search}%")
                            ->orWhere('concentration_code', 'like', "%{$search}%");
                    });

                if (mb_strtolower($stem, 'UTF-8') !== mb_strtolower($search, 'UTF-8')) {
                    $legacy->orWhereRaw('LOWER(TRIM(`name`)) = LOWER(?)', [$stem]);
                }

                if ($isNumericIdSearch) {
                    $legacy->orWhere((new Product())->getQualifiedKeyName(), (int) $search);
                    $legacy->orWhereHas('variants', function ($variantQuery) use ($search): void {
                        $variantQuery->where((new ProductVariantLink())->getQualifiedKeyName(), (int) $search);
                    });
                }

                if (
                    $brandFilter !== null
                    && $brandFilter > 0
                    && $rest !== ''
                    && mb_strtolower($rest, 'UTF-8') !== mb_strtolower($search, 'UTF-8')
                ) {
                    $restLike = '%'.$this->escapeLikeValue($rest).'%';
                    $legacy->orWhere(function ($brandRest) use ($brandFilter, $restLike): void {
                        $brandRest->where('brand_id', $brandFilter)
                            ->where(function ($nameMatch) use ($restLike): void {
                                $nameMatch->where('name', 'like', $restLike)
                                    ->orWhere('slug', 'like', $restLike)
                                    ->orWhereHas('variants.definition', function ($def) use ($restLike): void {
                                        $def->where('title', 'like', $restLike)
                                            ->orWhere('concentration_label', 'like', $restLike)
                                            ->orWhere('concentration_code', 'like', $restLike);
                                    });
                            });
                    });
                }
            });
        });
    }

    /**
     * @param  Builder<Product>  $w
     */
    private function applyAdminListTokenMatch(Builder $w, string $needle): void
    {
        $w->where('name', 'like', $needle)
            ->orWhere('slug', 'like', $needle)
            ->orWhereHas('brand', static function ($brandQuery) use ($needle): void {
                $brandQuery->where('name', 'like', $needle);
            })
            ->orWhereHas('variants.definition', static function ($def) use ($needle): void {
                $def->where('title', 'like', $needle)
                    ->orWhere('concentration_label', 'like', $needle)
                    ->orWhere('concentration_code', 'like', $needle);
            });
    }

    /**
     * @param  list<array<string, mixed>>  $ranked
     * @return list<array<string, mixed>>
     */
    private function appendAdminSmartSearchSkuAndIdHits(string $rawQuery, array $ranked, int $limit): array
    {
        $byId = [];
        foreach ($ranked as $row) {
            $byId[(int) $row['id']] = $row;
        }

        $trim = trim($rawQuery);
        if (preg_match('/^\d{1,12}$/', $trim) && (int) $trim > 0) {
            $pid = (int) $trim;
            $product = Product::query()
                ->with($this->adminSmartSearchProductEagerLoads())
                ->find($pid);
            if ($product) {
                $variants = $product->variants?->pluck('title')->filter()->values() ?? collect();
                [$stByV, $mw, $sw] = $this->batchWarehouseStocksByVariantIds(
                    $product->variants->pluck('id')->filter()->values()->all()
                );
                $byId[$product->id] = [
                    'id' => (int) $product->id,
                    'name' => (string) $product->name,
                    'brand_name' => $product->brand?->name ? (string) $product->brand->name : null,
                    'variant_titles' => $variants->values()->all(),
                    'variants_preview' => $this->smartSearchVariantLines(
                        $product->variants,
                        $stByV,
                        $mw,
                        $sw
                    ),
                    'score' => 1.0,
                ];
            }
        }

        if (mb_strlen($trim, 'UTF-8') >= 2) {
            $escaped = $this->escapeLikeValue($trim);
            $productIds = SupplierVariantOffer::query()
                ->where('supplier_variant_offers.is_active', true)
                ->where(function ($q) use ($escaped): void {
                    $like = '%'.$escaped.'%';
                    $q->where(function ($sq) use ($like): void {
                        $sq->whereNotNull('supplier_variant_offers.sku')
                            ->where('supplier_variant_offers.sku', 'like', $like);
                    })->orWhere(function ($eq) use ($like): void {
                        $eq->whereNotNull('supplier_variant_offers.external_id')
                            ->where('supplier_variant_offers.external_id', 'like', $like);
                    });
                })
                ->join('product_variant_links', 'product_variant_links.id', '=', 'supplier_variant_offers.product_variant_id')
                ->select('product_variant_links.product_id')
                ->distinct()
                ->limit(25)
                ->pluck('product_variant_links.product_id');

            foreach ($productIds as $pid) {
                $pid = (int) $pid;
                if ($pid <= 0 || isset($byId[$pid])) {
                    continue;
                }
                $product = Product::query()
                    ->with($this->adminSmartSearchProductEagerLoads())
                    ->find($pid);
                if (! $product) {
                    continue;
                }
                $variants = $product->variants?->pluck('title')->filter()->values() ?? collect();
                [$stByV, $mw, $sw] = $this->batchWarehouseStocksByVariantIds(
                    $product->variants->pluck('id')->filter()->values()->all()
                );
                $byId[$pid] = [
                    'id' => (int) $product->id,
                    'name' => (string) $product->name,
                    'brand_name' => $product->brand?->name ? (string) $product->brand->name : null,
                    'variant_titles' => $variants->values()->all(),
                    'variants_preview' => $this->smartSearchVariantLines(
                        $product->variants,
                        $stByV,
                        $mw,
                        $sw
                    ),
                    'score' => 0.35,
                ];
            }
        }

        $merged = array_values($byId);
        usort($merged, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        return array_slice($merged, 0, $limit);
    }
}
