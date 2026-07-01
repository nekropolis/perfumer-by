<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogProductLinkNameTokenizer;
use Modules\Catalog\Support\CatalogSearchScoring;
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

        $normalizedQuery = CatalogSearchScoring::normalizeSearchText($query);
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

            $scoreName = CatalogSearchScoring::similarityScore($normalizedQuery, CatalogSearchScoring::normalizeSearchText($name));
            $scoreSlug = CatalogSearchScoring::similarityScore($normalizedQuery, CatalogSearchScoring::normalizeSearchText($slug));
            $scoreBrand = $brandName !== '' ? CatalogSearchScoring::similarityScore($normalizedQuery, CatalogSearchScoring::normalizeSearchText($brandName)) : 0.0;
            $scoreVariant = $variantSlices->reduce(function (float $carry, string $piece) use ($normalizedQuery) {
                $score = CatalogSearchScoring::similarityScore($normalizedQuery, CatalogSearchScoring::normalizeSearchText($piece));

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

        $rows = $pool->map(function (Product $product) use ($query) {
            $name = (string) $product->name;
            $brandName = (string) ($product->brand?->name ?? '');
            $rank = CatalogSearchScoring::productSearchRank($query, $brandName, $name);

            return [
                'product' => $product,
                'score' => $rank['score'],
                'full' => $rank['full'],
                'tier' => $rank['tier'],
                'full_len' => $rank['full_len'],
            ];
        })
            ->sort(function (array $left, array $right): int {
                $tierCompare = ($left['tier'] ?? 99) <=> ($right['tier'] ?? 99);
                if ($tierCompare !== 0) {
                    return $tierCompare;
                }

                $scoreCompare = ($right['score'] ?? 0) <=> ($left['score'] ?? 0);
                if ($scoreCompare !== 0) {
                    return $scoreCompare;
                }

                $lenCompare = ($left['full_len'] ?? 0) <=> ($right['full_len'] ?? 0);
                if ($lenCompare !== 0) {
                    return $lenCompare;
                }

                return strcmp((string) $left['product']->name, (string) $right['product']->name);
            })
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
            $escaped = CatalogSearchScoring::escapeLikeValue($token);
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
                $escaped = CatalogSearchScoring::escapeLikeValue($phrase);
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
        $escaped = CatalogSearchScoring::escapeLikeValue($query);
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

    /**
     * Поиск в админском списке товаров: «Kenzo Flower By Legere» = бренд + AND по токенам имени.
     *
     * @param  Builder<Product>  $query
     */
    public function applyAdminProductListSearch(Builder $query, string $search): void
    {
        $search = trim(preg_replace('/\s+/u', ' ', $search) ?: $search);
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
        $distinguishingTokens = count($tokens) > count($significant) + ($hasGender ? 1 : 0);

        // Проверяем спецсимволы в исходном запросе $search, а не в $rest
        // (потому что splitLeadingBrand может распознать "T" как бренд и $rest = "mat" без дефиса)
        $searchHasSpecialChars = str_contains($search, '-') || str_contains($search, '"') || preg_match('/[\(\)]/', $search) !== 0;

        // Если rest содержит спец-символы, то токенизация ломает поиск — используем только legacy.
        $tokensLostSignificance = ($rest !== '' && $distinguishingTokens)
            && (str_contains($rest, '-') || str_contains($rest, '"') || preg_match('/[\(\)]/', $rest) !== 0);
        $useTokenizedPath = !$tokensLostSignificance && !$searchHasSpecialChars && ($brandFilter !== null || $significant !== [] || $hasGender);

        $query->where(function ($outer) use ($search, $stem, $isNumericIdSearch, $brandFilter, $significant, $hasGender, $tokens, $useTokenizedPath, $rest, $tokensLostSignificance, $searchHasSpecialChars): void {
            if ($useTokenizedPath) {
                $outer->where(function ($tokenized) use ($brandFilter, $significant, $hasGender, $tokens): void {
                    if ($brandFilter !== null && $brandFilter > 0) {
                        $tokenized->where('brand_id', $brandFilter);
                    }

                    foreach ($significant as $token) {
                        $needle = '%'.CatalogSearchScoring::escapeLikeValue($token).'%';
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

            $outer->orWhere(function ($legacy) use ($search, $stem, $isNumericIdSearch, $brandFilter, $rest, $tokensLostSignificance, $searchHasSpecialChars): void {
                $legacy->where('name', 'like', "%{$search}%")
                    ->orWhereHas('brand', function ($brandQuery) use ($search, $stem): void {
                        $brandQuery->where('name', 'like', "%{$search}%");
                        if (mb_strtolower($stem, 'UTF-8') !== mb_strtolower($search, 'UTF-8')) {
                            $brandQuery->orWhere('name', 'like', "%{$stem}%");
                        }
                    })
                    ->orWhereHas('variants.definition', function ($def) use ($search): void {
                        $def->where('title', 'like', "%{$search}%")
                            ->orWhere('concentration_label', 'like', "%{$search}%")
                            ->orWhere('concentration_code', 'like', "%{$search}%");
                    });

                // ОТображаемое имя товара: CONCAT(brand.name, ' ', name)
                $legacy->orWhereRaw(
                    "LOWER(TRIM(CONCAT(COALESCE((SELECT `name` FROM `brands` WHERE `brands`.`id` = `products`.`brand_id` LIMIT 1), ''), ' ', COALESCE(`products`.`name`, '')))) LIKE LOWER(?)",
                    ["%{$search}%"]
                );

                // Слаг не ищем, если в запросе спецсимволы — иначе дефисные slugs дают cross-boundary ложные совпадения.
                if (!$searchHasSpecialChars) {
                    $legacy->orWhere('slug', 'like', "%{$search}%");
                }

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
                    $restLike = '%'.CatalogSearchScoring::escapeLikeValue($rest).'%';
                    $legacy->orWhere(function ($brandRest) use ($brandFilter, $restLike, $searchHasSpecialChars, $search): void {
                        $brandRest->where('brand_id', $brandFilter)
                            ->where(function ($nameMatch) use ($restLike, $searchHasSpecialChars, $search): void {
                                $nameMatch->where('name', 'like', $restLike)
                                    ->orWhereHas('variants.definition', function ($def) use ($restLike): void {
                                        $def->where('title', 'like', $restLike)
                                            ->orWhere('concentration_label', 'like', $restLike)
                                            ->orWhere('concentration_code', 'like', $restLike);
                                    });

                                // Слаг не ищем, если в запросе спецсимволы — иначе дефисные slugs дают cross-boundary ложные совпадения.
                                if (!$searchHasSpecialChars) {
                                    $nameMatch->orWhere('slug', 'like', $restLike);
                                }
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
            $escaped = CatalogSearchScoring::escapeLikeValue($trim);
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
