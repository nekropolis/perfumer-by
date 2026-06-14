<?php

namespace Modules\Catalog\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Modules\Catalog\Http\Resources\ProductDetailResource;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Services\SimilarProductsService;
use Modules\Catalog\Services\SmartSearch\ProductSearchRetrievalService;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class ProductController extends Controller
{
    private const int SMART_SEARCH_POOL_LIMIT = 900;
    /** Товары с прямым вхождением полной строки запроса — не вытесняются «новыми» ID из общего пула. */
    private const int SMART_SEARCH_DIRECT_MATCH_LIMIT = 600;
    private const int SMART_SEARCH_RESULT_LIMIT = 10;
    private const int SMART_SEARCH_MAX_LIMIT = 30;
    /** Товары с опечаткой в запросе (1 буква в слове) — после точных, не более 5. */
    private const int SMART_SEARCH_TYPO_EXTRA_LIMIT = 5;
    /** Meili fast path: минимальный pool для PHP-ранжирования (не legacy 900). */
    private const int SMART_SEARCH_MEILI_POOL_MIN = 80;
    private const int SMART_SEARCH_MEILI_POOL_MAX = 200;
    private const int SMART_SEARCH_MATCH_EXACT = 0;
    /** Слова запроса подряд в названии: «Azzaro Night …». */
    private const int SMART_SEARCH_MATCH_CONSECUTIVE = 1;
    /** Слова запроса по порядку, не обязательно рядом: «Azzaro … Night». */
    private const int SMART_SEARCH_MATCH_SEQUENTIAL = 2;
    /** Все слова запроса в названии, порядок любой. */
    private const int SMART_SEARCH_MATCH_SCATTERED = 3;
    private const int SMART_SEARCH_MATCH_TYPO = 4;
    private const array VOLUME_BUCKETS = [
        ['key' => '1-3', 'label' => '1-3', 'min' => 1, 'max' => 3],
        ['key' => '4-9', 'label' => '4-9', 'min' => 4, 'max' => 9],
        ['key' => '10-25', 'label' => '10-25', 'min' => 10, 'max' => 25],
        ['key' => '25-50', 'label' => '25-50', 'min' => 25, 'max' => 50],
        ['key' => '50-100', 'label' => '50-100', 'min' => 50, 'max' => 100],
        ['key' => '100-200', 'label' => '100-200', 'min' => 100, 'max' => 200],
        ['key' => '200-plus', 'label' => '200+', 'min' => 200, 'max' => null],
    ];
    /**
     * Реальные колонки `product_variant_links` (объём/название концентрации — в `variant_definitions`, см. accessors на модели).
     *
     * @var list<string>
     */
    private const array VARIANT_LINK_COLUMNS = [
        'id',
        'product_id',
        'variant_definition_id',
        'price',
        'old_price',
        'is_preorder',
        'is_active',
        'stock',
        'reserved_stock',
        'sort_order',
    ];

    /**
     * Колонки `variant_definitions` для подгрузки к ссылке варианта (листинг / карточка).
     *
     * @var list<string>
     */
    private const array VARIANT_DEFINITION_COLUMNS = [
        'id',
        'volume_ml',
        'concentration_code',
        'concentration_label',
        'is_tester',
        'title',
    ];

    public function index(Request $request): JsonResponse
    {
        $payload = app(CatalogApiCacheService::class)->rememberProducts($request->query(), function () use ($request): array {
            $query = Product::query()
                ->where('is_active', true)
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
                ]);

            $this->applyCatalogBaseFilters($query, $request);
            $this->applyCatalogAttributeFilters($query, $request);
            $this->applyCatalogPriceFilters($query, $request);
            $this->applyCatalogVolumeFilters($query, $request);

            $query
                ->withMin('activeVariants as min_price', 'price')
                ->with([
                    'brand:id,name,slug',
                    'mainCategory:id,name,slug',
                    'images' => ProductListResource::imagesForListingEagerLoad(),
                    'activeVariants' => static function ($q): void {
                        $q->select(self::VARIANT_LINK_COLUMNS)
                            ->with([
                                'definition' => static function ($dq): void {
                                    $dq->select(self::VARIANT_DEFINITION_COLUMNS);
                                },
                            ]);
                    },
                ]);

            $sort = $request->string('sort')->toString();

            if ($sort === 'price_desc') {
                $query->orderByRaw('CASE WHEN min_price IS NULL THEN 1 ELSE 0 END')
                    ->orderByDesc('min_price')
                    ->orderBy('name');
            } elseif ($sort === 'name_desc') {
                $query->orderByDesc('name');
            } elseif ($sort === 'name_asc') {
                $query->orderBy('name');
            } else {
                $query->orderByRaw('CASE WHEN min_price IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('min_price')
                    ->orderBy('name');
            }

            $products = $query->paginate(24);

            return [
                'data' => ProductListResource::collection($products->getCollection())->resolve(),
                'meta' => [
                    'current_page' => $products->currentPage(),
                    'last_page' => $products->lastPage(),
                    'per_page' => $products->perPage(),
                    'total' => $products->total(),
                ],
            ];
        });

        return response()->json($payload);
    }

    public function filters(Request $request): JsonResponse
    {
        $payload = app(CatalogApiCacheService::class)->rememberCatalogFilters($request->query(), function () use ($request): array {
            $baseQuery = Product::query()
                ->where('is_active', true);

            $this->applyCatalogBaseFilters($baseQuery, $request);

            $priceRows = (clone $baseQuery)
                ->whereHas('activeVariants', function ($q): void {
                    $q->whereNotNull('price');
                })
                ->withMin('activeVariants as min_price', 'price')
                ->withMax('activeVariants as max_price', 'price')
                ->get(['id']);

            $minPrices = $priceRows
                ->pluck('min_price')
                ->filter(static fn ($value): bool => $value !== null)
                ->map(static fn ($value): float => (float) $value);
            $maxPrices = $priceRows
                ->pluck('max_price')
                ->filter(static fn ($value): bool => $value !== null)
                ->map(static fn ($value): float => (float) $value);

            $priceMin = $minPrices->isNotEmpty() ? (float) $minPrices->min() : null;
            $priceMax = $maxPrices->isNotEmpty() ? (float) $maxPrices->max() : null;

            $attributes = ProductAttribute::query()
                ->where('is_active', true)
                ->where('is_filterable', true)
                ->with(['activeOptions' => function ($q): void {
                    $q->select('id', 'product_attribute_id', 'name', 'sort_order')
                        ->orderBy('sort_order')
                        ->orderBy('name');
                }])
                ->orderBy('filter_sort_order')
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get();

            $attributePayload = $attributes->map(function (ProductAttribute $attribute) use ($baseQuery) {
                $options = $attribute->activeOptions->map(function ($option) use ($attribute, $baseQuery) {
                    $productsCount = (clone $baseQuery)
                        ->whereHas('attributeValues', function ($valueQuery) use ($attribute, $option): void {
                            $valueQuery
                                ->where('product_attribute_id', $attribute->id)
                                ->whereHas('selectedOptions', function ($selectedQuery) use ($option): void {
                                    $selectedQuery->where('product_attribute_option_id', $option->id);
                                });
                        })
                        ->count();

                    return [
                        'id' => (int) $option->id,
                        'name' => (string) $option->name,
                        'sort_order' => (int) $option->sort_order,
                        'products_count' => (int) $productsCount,
                    ];
                })->values()->all();

                return [
                    'id' => (int) $attribute->id,
                    'name' => (string) $attribute->name,
                    'type' => (string) $attribute->type,
                    'sort_order' => (int) $attribute->filter_sort_order,
                    'options' => $options,
                ];
            })->values()->all();

            $volumePayload = collect(self::VOLUME_BUCKETS)->map(function (array $bucket) use ($baseQuery) {
                $productsCount = (clone $baseQuery)
                    ->whereHas('activeVariants.definition', function ($definitionQuery) use ($bucket): void {
                        $min = (int) ($bucket['min'] ?? 0);
                        $max = $bucket['max'];
                        $definitionQuery->whereNotNull('volume_ml')
                            ->where('volume_ml', '>=', $min);
                        if ($max !== null) {
                            $definitionQuery->where('volume_ml', '<=', (int) $max);
                        }
                    })
                    ->count();

                return [
                    'key' => (string) $bucket['key'],
                    'label' => (string) $bucket['label'],
                    'products_count' => (int) $productsCount,
                ];
            })->values()->all();

            return [
                'data' => [
                    'price' => [
                        'min' => $priceMin,
                        'max' => $priceMax,
                    ],
                    'volume' => $volumePayload,
                    'attributes' => $attributePayload,
                ],
            ];
        });

        return response()->json($payload);
    }

    public function show(string $slug): JsonResponse
    {
        $payload = app(CatalogApiCacheService::class)->rememberProductBySlug($slug, function () use ($slug): array {
            $product = Product::query()
                ->where('slug', $slug)
                ->where('is_active', true)
                ->select([
                    'id',
                    'brand_id',
                    'main_category_id',
                    'is_active',
                    'is_new',
                    'is_hit',
                    'is_out_of_stock',
                    'name',
                    'slug',
                    'h1',
                    'short_description',
                    'description',
                    'seo_title',
                    'seo_description',
                ])
                ->with([
                    'brand:id,name,slug',
                    'mainCategory:id,name,slug',
                    'images' => static function ($q): void {
                        $q->select('id', 'product_id', 'path', 'is_main', 'sort_order')
                            ->orderByDesc('is_main')
                            ->orderBy('sort_order')
                            ->limit(24);
                    },
                    'attributeValues' => static function ($q): void {
                        $q->select('id', 'product_id', 'product_attribute_id', 'custom_value', 'sort_order')
                            ->orderBy('sort_order');
                    },
                    'attributeValues.productAttribute:id,name,type,is_filterable',
                    'attributeValues.selectedOptions' => static function ($q): void {
                        $q->select('id', 'product_attribute_value_id', 'product_attribute_option_id');
                    },
                    'attributeValues.selectedOptions.productAttributeOption:id,name',
                    'activeVariants' => static function ($q): void {
                        $q->select(self::VARIANT_LINK_COLUMNS)
                            ->with([
                                'definition' => static function ($dq): void {
                                    $dq->select(self::VARIANT_DEFINITION_COLUMNS);
                                },
                            ]);
                    },
                ])
                ->first();

            if ($product === null) {
                return [];
            }

            $similar = app(SimilarProductsService::class)->forProduct($product, 8);

            $detail = (new ProductDetailResource($product))->resolve();
            $detail['similar_products'] = ProductListResource::collection($similar)->resolve();

            return [
                'data' => $detail,
            ];
        });

        if (!isset($payload['data'])) {
            return response()->json([
                'message' => 'Товар не найден.',
            ], 404);
        }

        return response()->json($payload);
    }

    public function brands(): JsonResponse
    {
        $brands = app(CatalogApiCacheService::class)->rememberBrands(static function () {
            return Brand::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'slug'])
                ->toArray();
        });

        return response()->json([
            'data' => $brands,
        ]);
    }

    public function brandBySlug(string $slug): JsonResponse
    {
        $payload = app(CatalogApiCacheService::class)->rememberBrandBySlug($slug, function () use ($slug) {
            $row = Brand::query()
                ->where('slug', $slug)
                ->where('is_active', true)
                ->first([
                    'id',
                    'name',
                    'slug',
                    'description',
                    'seo_title',
                    'seo_description',
                    'seo_keyword',
                ]);

            return $row?->toArray() ?? [];
        });

        // Пустой кеш / «бренда нет» — без id; не смешиваем с JSON 200.
        if (!isset($payload['id'])) {
            return response()->json([
                'message' => 'Бренд не найден.',
            ], 404);
        }

        return response()->json([
            'data' => $payload,
        ]);
    }

    public function smartSearch(Request $request): JsonResponse
    {
        $startedAt = microtime(true);
        $query = trim($request->string('q')->toString());
        $limit = max(1, min((int) $request->input('limit', self::SMART_SEARCH_RESULT_LIMIT), self::SMART_SEARCH_MAX_LIMIT));
        $debug = $request->boolean('debug') && (bool) config('app.debug');

        if (mb_strlen($query, 'UTF-8') < 2) {
            return response()->json([
                'data' => [
                    'brands' => [],
                    'products' => [],
                ],
                'debug' => $debug ? ['reason' => 'query_too_short'] : null,
            ]);
        }

        $responseCacheKey = null;
        $responseCacheTtl = 0;
        if (!$debug) {
            $responseCacheTtl = max(5, (int) config('services.catalog_search.response_cache_ttl_seconds', 45));
            $responseCacheKey = sprintf(
                'catalog:smart-search:response:%s:%d',
                md5(mb_strtolower($query, 'UTF-8')),
                $limit,
            );
            $cachedResponse = Cache::get($responseCacheKey);
            if (is_array($cachedResponse)) {
                return response()->json($cachedResponse);
            }
        }

        $normalizedQuery = $this->normalizeSearchText($query);
        $tokens = array_values(array_filter(explode(' ', $normalizedQuery)));
        $typoCorrectedQuery = $this->resolveTypoCorrectedQuery($normalizedQuery, $tokens);
        $searchPatterns = collect($tokens)
            ->flatMap(function (string $token): array {
                $variants = [$token];
                $length = mb_strlen($token, 'UTF-8');
                if ($length > 4) {
                    $variants[] = mb_substr($token, 0, $length - 1, 'UTF-8');
                }
                if ($length > 5) {
                    $variants[] = mb_substr($token, 0, $length - 2, 'UTF-8');
                }
                return $variants;
            })
            ->map(static fn (string $token) => trim($token))
            ->filter(static fn (string $token) => mb_strlen($token, 'UTF-8') >= 3)
            ->unique()
            ->values()
            ->all();

        $queryLike = '%'.$this->escapeLikeValue($query).'%';
        $patternLikes = array_map(
            fn (string $pattern): string => '%'.$this->escapeLikeValue($pattern).'%',
            $searchPatterns
        );

        $meiliPoolLimit = $this->smartSearchMeiliPoolLimit($limit);
        $productColumns = $this->smartSearchProductColumns();
        $legacyProductQuery = $this->smartSearchLegacyProductQuery();
        $rankingProductQuery = $this->smartSearchRankingProductQuery();
        $usesLightweightPool = false;

        $codeOrSkuBoostIds = $this->activeProductIdsMatchingCodeOrSku($query);
        $isCodeLikeQuery = preg_match('/^[\p{L}\p{N}\-_]{2,}$/u', $query) === 1 && !str_contains($query, ' ');
        $isStrictNumericQuery = preg_match('/^\d{3,12}$/', $query) === 1;

        $meiliResult = [
            'ids' => [],
            'suggested_query' => null,
            'source' => 'legacy',
            'elapsed_ms' => 0,
        ];
        $meiliIds = [];

        if ($codeOrSkuBoostIds !== [] && $isCodeLikeQuery) {
            $meiliIds = $codeOrSkuBoostIds;
            $meiliResult['ids'] = $meiliIds;
            $meiliResult['source'] = 'code_lookup';
        } elseif (!$isStrictNumericQuery) {
            $meiliResult = app(ProductSearchRetrievalService::class)->searchProductIds($query, $meiliPoolLimit);
            $meiliIds = $meiliResult['ids'] ?? [];
        }

        $searchBackend = (string) ($meiliResult['source'] ?? 'legacy');

        if ($meiliIds !== []) {
            $usesLightweightPool = $searchBackend !== 'legacy';
            if ($usesLightweightPool) {
                $meiliIds = array_slice($meiliIds, 0, $meiliPoolLimit);
            }
            $poolQueryForIds = $usesLightweightPool ? $rankingProductQuery : $legacyProductQuery;
            $pool = $this->smartSearchFetchProductsByMeiliIds($poolQueryForIds, $meiliIds, $productColumns);
        } else {
            $poolQuery = (clone $legacyProductQuery)->where(function ($q) use ($queryLike, $patternLikes, $query): void {
                $q->where('name', 'like', $queryLike)
                    ->orWhere('slug', 'like', $queryLike)
                    ->orWhereHas('brand', function ($bq) use ($queryLike): void {
                        $bq->where('name', 'like', $queryLike)
                            ->orWhere('slug', 'like', $queryLike);
                    })
                    ->orWhereHas('variants.definition', function ($vq) use ($queryLike): void {
                        $vq->where('title', 'like', $queryLike);
                    });
                $this->orWhereBrandPlusProductNameLike($q, $queryLike);

                foreach ($patternLikes as $like) {
                    $q->orWhere('name', 'like', $like)
                        ->orWhere('slug', 'like', $like)
                        ->orWhereHas('brand', function ($bq) use ($like): void {
                            $bq->where('name', 'like', $like)
                                ->orWhere('slug', 'like', $like);
                        })
                        ->orWhereHas('variants.definition', function ($vq) use ($like): void {
                            $vq->where('title', 'like', $like);
                        });
                    $this->orWhereBrandPlusProductNameLike($q, $like);
                }
                $this->orWhereProductIdOrSupplierSku($q, $query, $queryLike);
            });

            $directMatchQuery = (clone $legacyProductQuery)->where(function ($q) use ($queryLike, $query): void {
                $q->where('name', 'like', $queryLike)
                    ->orWhere('slug', 'like', $queryLike)
                    ->orWhereHas('brand', function ($bq) use ($queryLike): void {
                        $bq->where('name', 'like', $queryLike)
                            ->orWhere('slug', 'like', $queryLike);
                    })
                    ->orWhereHas('variants.definition', function ($vq) use ($queryLike): void {
                        $vq->where('title', 'like', $queryLike);
                    });
                $this->orWhereBrandPlusProductNameLike($q, $queryLike);
                $this->orWhereProductIdOrSupplierSku($q, $query, $queryLike);
            });
            $directPool = $directMatchQuery
                ->orderByDesc('id')
                ->limit(self::SMART_SEARCH_DIRECT_MATCH_LIMIT)
                ->get(['id', 'brand_id', 'name', 'slug', 'is_new', 'is_hit', 'is_out_of_stock']);

            $directIds = $directPool->pluck('id')->all();
            $broadQuery = (clone $poolQuery);
            if ($directIds !== []) {
                $broadQuery->whereKeyNot($directIds);
            }
            $broadPool = $broadQuery
                ->orderByDesc('id')
                ->limit(self::SMART_SEARCH_POOL_LIMIT)
                ->get(['id', 'brand_id', 'name', 'slug', 'is_new', 'is_hit', 'is_out_of_stock']);

            $pool = $directPool->concat($broadPool)->unique('id');
        }

        if ($typoCorrectedQuery !== null) {
            $pool = $this->mergeSmartSearchPoolForQuery(
                $pool,
                $usesLightweightPool ? $rankingProductQuery : $legacyProductQuery,
                $typoCorrectedQuery,
                $isStrictNumericQuery,
                $usesLightweightPool ? $meiliPoolLimit : self::SMART_SEARCH_POOL_LIMIT,
            );
        }

        if (count($tokens) >= 2 && !$usesLightweightPool) {
            $pool = $this->mergeSmartSearchPoolForAllTokens($pool, $legacyProductQuery, $tokens);
        }

        if ($codeOrSkuBoostIds !== []) {
            $existing = $pool->pluck('id')->all();
            $missingIds = array_values(array_diff($codeOrSkuBoostIds, $existing));
            if ($missingIds !== []) {
                $extraPoolQuery = $usesLightweightPool ? $rankingProductQuery : $legacyProductQuery;
                $extraPool = (clone $extraPoolQuery)
                    ->whereIn('id', $missingIds)
                    ->orderByDesc('id')
                    ->get($productColumns);
                $pool = $pool->concat($extraPool)->unique('id');
            }
        }
        $codeOrSkuBoostSet = array_fill_keys($codeOrSkuBoostIds, true);
        $matchedCodeByProductId = $this->matchedCodeByProductId($query, $pool->pluck('id')->map(static fn ($id): int => (int) $id)->all());

        $mainWarehouseId = $this->smartSearchWarehouseId(Warehouse::CODE_MAIN);
        $supplierWarehouseId = $this->smartSearchWarehouseId(Warehouse::CODE_SUPPLIER);

        $rankContext = [
            'normalizedQuery' => $normalizedQuery,
            'typoCorrectedQuery' => $typoCorrectedQuery,
            'tokens' => $tokens,
            'mainWarehouseId' => $mainWarehouseId,
            'supplierWarehouseId' => $supplierWarehouseId,
            'codeOrSkuBoostSet' => $codeOrSkuBoostSet,
            'matchedCodeByProductId' => $matchedCodeByProductId,
        ];
        $candidateIds = [];

        if ($usesLightweightPool) {
            $phaseOneRanked = $this->smartSearchRankPoolProducts(
                $pool,
                $rankContext,
                collect(),
                roughAvailability: true,
            );
            $candidateIds = $this->smartSearchCandidateIdsFromRanked(
                $phaseOneRanked,
                $this->smartSearchCandidateLimit($limit),
                $typoCorrectedQuery,
            );
            $candidatePool = $pool->filter(static fn (Product $product): bool => in_array((int) $product->id, $candidateIds, true));
            $stocksByVariantId = $this->smartSearchLoadStocksByVariantId(
                $candidatePool,
                $mainWarehouseId,
                $supplierWarehouseId,
            );
            $rankedProductsCollection = $this->smartSearchRankPoolProducts(
                $candidatePool,
                $rankContext,
                $stocksByVariantId,
                roughAvailability: false,
            );
        } else {
            $stocksByVariantId = $this->smartSearchLoadStocksByVariantId(
                $pool,
                $mainWarehouseId,
                $supplierWarehouseId,
            );
            $rankedProductsCollection = $this->smartSearchRankPoolProducts(
                $pool,
                $rankContext,
                $stocksByVariantId,
                roughAvailability: false,
            );
        }

        $rankedProducts = $this->smartSearchFinalizeRankedProducts(
            $rankedProductsCollection,
            $limit,
            $typoCorrectedQuery,
        );

        if ($usesLightweightPool) {
            $rankedProducts = $this->smartSearchAttachImagesToRankedProducts($rankedProducts);
        }

        $rankedBrands = $this->buildSmartSearchRankedBrands($query, $tokens, $normalizedQuery);

        if (!$debug) {
            $rankedProducts = array_map(static function (array $item): array {
                unset($item['score']);
                unset($item['_availability_rank']);
                unset($item['_match_tier']);
                unset($item['_typo_phrase']);
                return $item;
            }, $rankedProducts);
            $rankedBrands = array_map(static function (array $item): array {
                unset($item['score']);
                return $item;
            }, $rankedBrands);
        } else {
            $rankedProducts = array_map(static function (array $item): array {
                unset($item['_availability_rank']);
                unset($item['_match_tier']);
                unset($item['_typo_phrase']);
                return $item;
            }, $rankedProducts);
        }

        $response = [
            'data' => [
                'brands' => $rankedBrands,
                'products' => $rankedProducts,
                'suggested_query' => ($typoCorrectedQuery !== null
                    && $typoCorrectedQuery !== $normalizedQuery
                    && count($rankedProducts) > 0)
                    ? $typoCorrectedQuery
                    : null,
            ],
        ];
        if ($debug) {
            $response['debug'] = [
                'query' => $query,
                'normalized_query' => $normalizedQuery,
                'tokens' => $tokens,
                'search_patterns' => $searchPatterns,
                'product_pool_count' => $pool->count(),
                'brand_result_count' => count($rankedBrands),
                'product_result_count' => count($rankedProducts),
                'search_backend' => $searchBackend,
                'product_pool_limit' => $usesLightweightPool ? $meiliPoolLimit : self::SMART_SEARCH_POOL_LIMIT,
                'lightweight_pool' => $usesLightweightPool,
                'candidate_pool_count' => $usesLightweightPool ? count($candidateIds) : null,
                'search_backend_elapsed_ms' => (int) ($meiliResult['elapsed_ms'] ?? 0),
                'total_elapsed_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            ];
        }

        $totalElapsedMs = (int) round((microtime(true) - $startedAt) * 1000);
        if ((bool) config('services.catalog_search.log_metrics', true)) {
            $normalizedForProbe = mb_strtolower(trim($query), 'UTF-8');
            $probeQueries = collect((array) config('catalog_search.quality_probe_queries', []))
                ->map(static fn ($item): string => mb_strtolower(trim((string) $item), 'UTF-8'))
                ->filter(static fn (string $item): bool => $item !== '')
                ->values()
                ->all();
            $targetP95Ms = $limit <= 16
                ? (int) config('catalog_search.slo.header_p95_ms', 250)
                : (int) config('catalog_search.slo.search_page_p95_ms', 450);

            Log::info('catalog.smart_search', [
                'query' => $query,
                'has_results' => (count($rankedProducts) + count($rankedBrands)) > 0,
                'brand_count' => count($rankedBrands),
                'product_count' => count($rankedProducts),
                'suggested_query' => $response['data']['suggested_query'],
                'backend' => $searchBackend,
                'lightweight_pool' => $usesLightweightPool,
                'candidate_pool_count' => $usesLightweightPool ? count($candidateIds) : null,
                'product_pool_limit' => $usesLightweightPool ? $meiliPoolLimit : self::SMART_SEARCH_POOL_LIMIT,
                'backend_elapsed_ms' => (int) ($meiliResult['elapsed_ms'] ?? 0),
                'total_elapsed_ms' => $totalElapsedMs,
                'slo_target_ms' => $targetP95Ms,
                'slo_exceeded' => $totalElapsedMs > $targetP95Ms,
                'quality_probe_query' => in_array($normalizedForProbe, $probeQueries, true),
            ]);
        }

        if ($responseCacheKey !== null && $responseCacheTtl > 0) {
            Cache::put($responseCacheKey, $response, $responseCacheTtl);
        }

        return response()->json($response);
    }

    /**
     * Числовой id товара или SKU активного оффера поставщика — попадают в выдачу шапки / поиска.
     */
    private function orWhereProductIdOrSupplierSku(Builder $q, string $rawQuery, string $queryLike): void
    {
        $trim = trim($rawQuery);
        if (preg_match('/^\d{1,12}$/', $trim) && (int) $trim > 0) {
            $q->orWhere((new Product())->getQualifiedKeyName(), (int) $trim);
        }
        if (mb_strlen($trim, 'UTF-8') >= 2) {
            $q->orWhereHas('variants', function (Builder $vq) use ($queryLike): void {
                $vq->whereHas('supplierOffers', function (Builder $sq) use ($queryLike): void {
                    $sq->where('is_active', true)
                        ->whereNotNull('sku')
                        ->where('sku', 'like', $queryLike);
                });
            });
        }
    }

    /**
     * @return list<int>
     */
    private function activeProductIdsMatchingCodeOrSku(string $rawQuery): array
    {
        $trim = trim($rawQuery);
        $ids = collect();

        if (preg_match('/^\d{1,12}$/', $trim) && (int) $trim > 0) {
            $pid = (int) $trim;
            if (Product::query()->where('is_active', true)->whereKey($pid)->exists()) {
                $ids->push($pid);
            }
        }

        if (mb_strlen($trim, 'UTF-8') >= 2) {
            $escaped = addcslashes($trim, '%_\\');
            $like = '%'.$escaped.'%';
            $fromSku = SupplierVariantOffer::query()
                ->where('supplier_variant_offers.is_active', true)
                ->whereNotNull('supplier_variant_offers.sku')
                ->where('supplier_variant_offers.sku', 'like', $like)
                ->join('product_variant_links', 'product_variant_links.id', '=', 'supplier_variant_offers.product_variant_id')
                ->join('products', 'products.id', '=', 'product_variant_links.product_id')
                ->where('products.is_active', true)
                ->select('products.id')
                ->distinct()
                ->pluck('products.id');
            $ids = $ids->merge($fromSku);

            $fromExternalId = SupplierVariantOffer::query()
                ->where('supplier_variant_offers.is_active', true)
                ->whereNotNull('supplier_variant_offers.external_id')
                ->where('supplier_variant_offers.external_id', 'like', $like)
                ->join('product_variant_links', 'product_variant_links.id', '=', 'supplier_variant_offers.product_variant_id')
                ->join('products', 'products.id', '=', 'product_variant_links.product_id')
                ->where('products.is_active', true)
                ->select('products.id')
                ->distinct()
                ->pluck('products.id');
            $ids = $ids->merge($fromExternalId);
        }

        if (preg_match('/^\d{1,12}$/', $trim) && (int) $trim > 0) {
            $fromVariantId = \Modules\Catalog\Models\ProductVariantLink::query()
                ->whereKey((int) $trim)
                ->join('products', 'products.id', '=', 'product_variant_links.product_id')
                ->where('products.is_active', true)
                ->select('products.id')
                ->distinct()
                ->pluck('products.id');
            $ids = $ids->merge($fromVariantId);
        }

        return $ids->unique()->map(static fn ($id): int => (int) $id)->values()->all();
    }

    /**
     * @param  list<int>  $productIds
     * @return array<int, string>
     */
    private function matchedCodeByProductId(string $rawQuery, array $productIds): array
    {
        $trim = trim($rawQuery);
        if ($trim === '' || $productIds === []) {
            return [];
        }

        $matched = [];
        if (preg_match('/^\d{1,12}$/', $trim) === 1 && (int) $trim > 0) {
            $productId = (int) $trim;
            if (in_array($productId, $productIds, true)) {
                $matched[$productId] = $trim;
            }

            $variantRows = \Modules\Catalog\Models\ProductVariantLink::query()
                ->whereKey((int) $trim)
                ->whereIn('product_id', $productIds)
                ->get(['id', 'product_id']);
            foreach ($variantRows as $row) {
                $pid = (int) $row->product_id;
                if (!isset($matched[$pid])) {
                    $matched[$pid] = (string) $row->id;
                }
            }
        }

        $escaped = addcslashes($trim, '%_\\');
        $like = '%'.$escaped.'%';
        $offerRows = SupplierVariantOffer::query()
            ->where('supplier_variant_offers.is_active', true)
            ->where(function ($q) use ($like): void {
                $q->where('supplier_variant_offers.sku', 'like', $like)
                    ->orWhere('supplier_variant_offers.external_id', 'like', $like);
            })
            ->join('product_variant_links', 'product_variant_links.id', '=', 'supplier_variant_offers.product_variant_id')
            ->whereIn('product_variant_links.product_id', $productIds)
            ->select([
                'product_variant_links.product_id',
                'supplier_variant_offers.sku',
                'supplier_variant_offers.external_id',
            ])
            ->get();

        $queryNorm = mb_strtolower($trim, 'UTF-8');
        foreach ($offerRows as $row) {
            $pid = (int) $row->product_id;
            if (isset($matched[$pid])) {
                continue;
            }

            $candidates = array_values(array_filter([
                trim((string) ($row->sku ?? '')),
                trim((string) ($row->external_id ?? '')),
            ]));
            if ($candidates === []) {
                continue;
            }

            $exact = null;
            foreach ($candidates as $candidate) {
                if (mb_strtolower($candidate, 'UTF-8') === $queryNorm) {
                    $exact = $candidate;
                    break;
                }
            }
            $matched[$pid] = $exact ?? $candidates[0];
        }

        return $matched;
    }

    /**
     * Бренды в подсказках — только по названию/slug бренда, не по названиям товаров.
     *
     * @param  list<string>  $tokens
     * @return list<array<string, mixed>>
     */
    private function buildSmartSearchRankedBrands(string $query, array $tokens, string $normalizedQuery): array
    {
        return $this->smartSearchBrandsDirectMatch($query, $tokens, $normalizedQuery, 5);
    }

    /**
     * Товар в выдаче: запрос как подстрока в «бренд + название» (как на витрине).
     * Для однословного запроса — отдельное слово в названии товара.
     * Для нескольких слов — только целая фраза, не разрозненные токены
     * (иначе «the one» матчит «Take One To The Moon»).
     *
     * @param  list<string>  $tokens
     */
    /**
     * @param  \Illuminate\Support\Collection<int, Product>  $pool
     * @return \Illuminate\Support\Collection<int, Product>
     */
    private function mergeSmartSearchPoolForQuery(
        $pool,
        Builder $baseProductQuery,
        string $normalizedQuery,
        bool $isStrictNumericQuery,
        int $meiliPoolLimit = self::SMART_SEARCH_POOL_LIMIT,
    ) {
        $columns = $this->smartSearchProductColumns();
        $correctedLike = '%'.$this->escapeLikeValue($normalizedQuery).'%';

        $sqlPool = (clone $baseProductQuery)
            ->where(function ($q) use ($correctedLike): void {
                $q->where('name', 'like', $correctedLike)
                    ->orWhere('slug', 'like', $correctedLike);
                $this->orWhereBrandPlusProductNameLike($q, $correctedLike);
            })
            ->orderByDesc('id')
            ->limit(self::SMART_SEARCH_DIRECT_MATCH_LIMIT)
            ->get($columns);

        $pool = $pool->concat($sqlPool);

        if (!$isStrictNumericQuery) {
            $correctedMeili = app(ProductSearchRetrievalService::class)->searchProductIds(
                $normalizedQuery,
                $meiliPoolLimit,
            );
            $correctedIds = array_slice($correctedMeili['ids'] ?? [], 0, $meiliPoolLimit);
            if ($correctedIds !== []) {
                $meiliPool = $this->smartSearchFetchProductsByMeiliIds($baseProductQuery, $correctedIds, $columns);
                $pool = $pool->concat($meiliPool);
            }
        }

        return $pool->unique('id')->values();
    }

    /**
     * Подбор исправленного запроса: «the ont» → «the one», если такая фраза есть в каталоге.
     *
     * @param  list<string>  $tokens
     */
    private function resolveTypoCorrectedQuery(string $normalizedQuery, array $tokens): ?string
    {
        if ($normalizedQuery === '' || $this->catalogHasExactPhrase($normalizedQuery)) {
            return null;
        }

        $stopWords = ['the', 'and', 'for', 'with', 'men', 'eau', 'de', 'la', 'le', 'des', 'pour', 'her', 'him'];
        $candidateQueries = [];

        foreach ($tokens as $index => $token) {
            $length = mb_strlen($token, 'UTF-8');
            if ($length < 3 || $length > 5 || in_array($token, $stopWords, true)) {
                continue;
            }
            if (!preg_match('/^[a-z0-9]+$/', $token)) {
                continue;
            }

            foreach ($this->generateTypoVariants($token) as $variant) {
                $trial = $tokens;
                $trial[$index] = $variant;
                $candidateQueries[] = implode(' ', $trial);
            }
        }

        foreach (array_unique($candidateQueries) as $candidate) {
            if ($candidate === $normalizedQuery) {
                continue;
            }
            if ($this->catalogHasExactPhrase($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function catalogHasExactPhrase(string $normalizedPhrase): bool
    {
        if ($normalizedPhrase === '') {
            return false;
        }

        $like = '%'.$this->escapeLikeValue($normalizedPhrase).'%';

        return Product::query()
            ->where('is_active', true)
            ->where(function (Builder $q) use ($like): void {
                $q->whereRaw('LOWER(name) LIKE ?', [$like]);
                $this->orWhereBrandPlusProductNameLike($q, $like);
            })
            ->exists();
    }

    /**
     * Варианты слова с одной опечаткой (латиница, 3–5 букв).
     *
     * @return list<string>
     */
    private function generateTypoVariants(string $word): array
    {
        $length = strlen($word);
        if ($length < 3 || $length > 5) {
            return [];
        }

        $variants = [];
        $alphabet = 'abcdefghijklmnopqrstuvwxyz';

        for ($i = 0; $i < $length; $i++) {
            foreach (str_split($alphabet) as $char) {
                $variant = substr($word, 0, $i).$char.substr($word, $i + 1);
                if ($variant !== $word) {
                    $variants[] = $variant;
                }
            }
        }

        for ($i = 0; $i < $length; $i++) {
            $variants[] = substr($word, 0, $i).substr($word, $i + 1);
        }

        for ($i = 0; $i <= $length; $i++) {
            foreach (str_split($alphabet) as $char) {
                $variants[] = substr($word, 0, $i).$char.substr($word, $i);
            }
        }

        return array_values(array_unique(array_filter(
            $variants,
            static fn (string $variant): bool => strlen($variant) >= 2 && strlen($variant) <= 6,
        )));
    }

    /**
     * @param  list<string>  $tokens
     */
    private function smartSearchResolveProductMatchTier(
        string $normalizedQuery,
        array $tokens,
        string $normalizedDisplay,
        ?string $typoCorrectedQuery,
        bool $isCodeBoost,
    ): ?int {
        if ($isCodeBoost) {
            return self::SMART_SEARCH_MATCH_EXACT;
        }

        if ($normalizedDisplay === '' || $normalizedQuery === '') {
            return null;
        }

        if (
            ($typoCorrectedQuery !== null && str_contains($normalizedDisplay, $typoCorrectedQuery))
            || str_contains($normalizedDisplay, $normalizedQuery)
        ) {
            return self::SMART_SEARCH_MATCH_EXACT;
        }

        $significantTokens = array_values(array_filter(
            $tokens,
            static fn (string $token): bool => mb_strlen($token, 'UTF-8') >= 2
        ));
        if ($significantTokens === []) {
            return null;
        }

        if (count($significantTokens) === 1) {
            return $this->matchesAllTokensAsWords($normalizedDisplay, $significantTokens)
                ? self::SMART_SEARCH_MATCH_EXACT
                : null;
        }

        if ($this->smartSearchTokensMatchConsecutive($significantTokens, $normalizedDisplay)) {
            return self::SMART_SEARCH_MATCH_CONSECUTIVE;
        }

        if ($this->smartSearchTokensMatchInOrder($significantTokens, $normalizedDisplay)) {
            return self::SMART_SEARCH_MATCH_SEQUENTIAL;
        }

        if ($this->matchesAllTokensAsWords($normalizedDisplay, $significantTokens)) {
            return self::SMART_SEARCH_MATCH_SCATTERED;
        }

        return null;
    }

    /**
     * @param  list<string>  $tokens
     * @return list<string>
     */
    private function smartSearchDisplayWords(string $normalizedDisplay): array
    {
        return array_values(array_filter(explode(' ', $normalizedDisplay)));
    }

    /**
     * Слова запроса подряд в названии.
     *
     * @param  list<string>  $tokens
     */
    private function smartSearchTokensMatchConsecutive(array $tokens, string $normalizedDisplay): bool
    {
        $displayWords = $this->smartSearchDisplayWords($normalizedDisplay);
        $count = count($tokens);
        if ($count === 0 || count($displayWords) < $count) {
            return false;
        }

        for ($i = 0; $i <= count($displayWords) - $count; $i++) {
            if (array_slice($displayWords, $i, $count) === $tokens) {
                return true;
            }
        }

        return false;
    }

    /**
     * Слова запроса в том же порядке, между ними могут быть другие слова.
     *
     * @param  list<string>  $tokens
     */
    private function smartSearchTokensMatchInOrder(array $tokens, string $normalizedDisplay): bool
    {
        $displayWords = $this->smartSearchDisplayWords($normalizedDisplay);
        if ($displayWords === []) {
            return false;
        }

        $tokenIndex = 0;
        foreach ($displayWords as $word) {
            if ($word !== $tokens[$tokenIndex]) {
                continue;
            }
            $tokenIndex++;
            if ($tokenIndex >= count($tokens)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Product>  $pool
     * @param  list<string>  $tokens
     * @return \Illuminate\Support\Collection<int, Product>
     */
    private function mergeSmartSearchPoolForAllTokens(
        $pool,
        Builder $baseProductQuery,
        array $tokens,
    ) {
        $significantTokens = array_values(array_filter(
            $tokens,
            static fn (string $token): bool => mb_strlen($token, 'UTF-8') >= 2
        ));
        if (count($significantTokens) < 2) {
            return $pool;
        }

        $columns = $this->smartSearchProductColumns();
        $tokenPoolQuery = clone $baseProductQuery;
        foreach ($significantTokens as $token) {
            $like = '%'.$this->escapeLikeValue($token).'%';
            $tokenPoolQuery->where(function (Builder $q) use ($like): void {
                $q->where('name', 'like', $like)
                    ->orWhere('slug', 'like', $like)
                    ->orWhereHas('brand', function ($bq) use ($like): void {
                        $bq->where('name', 'like', $like)
                            ->orWhere('slug', 'like', $like);
                    });
                $this->orWhereBrandPlusProductNameLike($q, $like);
            });
        }

        $tokenPool = $tokenPoolQuery
            ->orderByDesc('id')
            ->limit(self::SMART_SEARCH_POOL_LIMIT)
            ->get($columns);

        return $pool->concat($tokenPool)->unique('id')->values();
    }

    /**
     * Фраза из названия с опечаткой в запросе (не более 1 буквы на слово, порядок слов тот же).
     * «the ont» → «the one»; «Take One To The Moon» не матчится.
     */
    private function smartSearchExtractTypoPhrase(string $normalizedQuery, string $normalizedDisplay): ?string
    {
        if ($normalizedQuery === '' || $normalizedDisplay === '') {
            return null;
        }

        if (str_contains($normalizedDisplay, $normalizedQuery)) {
            return null;
        }

        $queryWords = array_values(array_filter(explode(' ', $normalizedQuery)));
        $displayWords = array_values(array_filter(explode(' ', $normalizedDisplay)));
        if ($queryWords === [] || count($displayWords) < count($queryWords)) {
            return null;
        }

        $wordCount = count($queryWords);
        $bestPhrase = null;
        $bestDistance = PHP_INT_MAX;

        for ($i = 0; $i <= count($displayWords) - $wordCount; $i++) {
            $window = array_slice($displayWords, $i, $wordCount);
            $distance = 0;
            $hasTypo = false;

            foreach ($queryWords as $index => $queryWord) {
                $displayWord = $window[$index];
                $wordDistance = $this->mbLevenshtein($queryWord, $displayWord);
                if ($wordDistance > 1) {
                    $distance = PHP_INT_MAX;
                    break;
                }
                $distance += $wordDistance;
                if ($wordDistance > 0) {
                    $hasTypo = true;
                }
            }

            if ($distance === PHP_INT_MAX || !$hasTypo) {
                continue;
            }

            if ($distance < $bestDistance) {
                $bestDistance = $distance;
                $bestPhrase = implode(' ', $window);
            }
        }

        return $bestPhrase;
    }

    private function mbLevenshtein(string $a, string $b): int
    {
        if ($a === $b) {
            return 0;
        }

        $lenA = mb_strlen($a, 'UTF-8');
        $lenB = mb_strlen($b, 'UTF-8');
        if ($lenA === 0) {
            return $lenB;
        }
        if ($lenB === 0) {
            return $lenA;
        }

        if (preg_match('/^[\x20-\x7E]+$/', $a) === 1 && preg_match('/^[\x20-\x7E]+$/', $b) === 1) {
            return levenshtein($a, $b);
        }

        $prev = range(0, $lenB);
        for ($i = 1; $i <= $lenA; $i++) {
            $current = [$i];
            $charA = mb_substr($a, $i - 1, 1, 'UTF-8');
            for ($j = 1; $j <= $lenB; $j++) {
                $cost = $charA === mb_substr($b, $j - 1, 1, 'UTF-8') ? 0 : 1;
                $current[$j] = min(
                    $current[$j - 1] + 1,
                    $prev[$j] + 1,
                    $prev[$j - 1] + $cost,
                );
            }
            $prev = $current;
        }

        return (int) $prev[$lenB];
    }

    /**
     * @param  list<string>  $tokens
     * @return list<array<string, mixed>>
     */
    private function smartSearchBrandsDirectMatch(string $query, array $tokens, string $normalizedQuery, int $limit): array
    {
        $significantTokens = array_values(array_filter(
            $tokens,
            static fn (string $t): bool => mb_strlen($t, 'UTF-8') >= 2
        ));

        if ($significantTokens === []) {
            return [];
        }

        $queryLike = '%'.$this->escapeLikeValue($query).'%';

        return Brand::query()
            ->where('is_active', true)
            ->where(function ($q) use ($queryLike): void {
                $q->where('name', 'like', $queryLike)
                    ->orWhere('slug', 'like', $queryLike);
            })
            ->withCount(['products as products_count' => fn ($q) => $q->where('is_active', true)])
            ->get(['id', 'name', 'slug'])
            ->filter(function (Brand $brand) use ($significantTokens, $normalizedQuery): bool {
                $normalizedBrandName = $this->normalizeSearchText((string) $brand->name);
                $normalizedBrandSlug = $this->normalizeSearchText((string) $brand->slug);

                if (
                    ! $this->matchesAllTokensAsWords($normalizedBrandName, $significantTokens)
                    && ! $this->matchesAllTokensAsWords($normalizedBrandSlug, $significantTokens)
                ) {
                    return false;
                }

                $score = max(
                    $this->similarityScore($normalizedQuery, $normalizedBrandName),
                    $this->similarityScore($normalizedQuery, $normalizedBrandSlug) * 0.95,
                );

                return $score >= 0.45;
            })
            ->sortByDesc(function (Brand $brand) use ($normalizedQuery): float {
                return max(
                    $this->similarityScore($normalizedQuery, $this->normalizeSearchText((string) $brand->name)),
                    $this->similarityScore($normalizedQuery, $this->normalizeSearchText((string) $brand->slug)) * 0.95,
                );
            })
            ->take($limit)
            ->map(static function (Brand $brand): array {
                return [
                    'id' => (int) $brand->id,
                    'name' => (string) $brand->name,
                    'slug' => (string) $brand->slug,
                    'products_count' => (int) ($brand->products_count ?? 0),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Токен только как отдельное слово — «one» не матчит «jones».
     *
     * @param  list<string>  $tokens
     */
    private function matchesAllTokensAsWords(string $normalizedHaystack, array $tokens): bool
    {
        if ($normalizedHaystack === '') {
            return false;
        }

        $matched = false;
        foreach ($tokens as $token) {
            if (mb_strlen($token, 'UTF-8') < 2) {
                continue;
            }
            $matched = true;
            $pattern = '/(?:^|\s)'.preg_quote($token, '/').'(?:\s|$)/u';
            if (! preg_match($pattern, $normalizedHaystack)) {
                return false;
            }
        }

        return $matched;
    }

    /**
     * Экранирование спецсимволов LIKE (%, _, \).
     */
    private function escapeLikeValue(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    /**
     * SQL-выражение «бренд + пробел + название товара» для сопоставления с полной строкой запроса (как на витрине).
     */
    private function brandProductDisplayTitleSql(string $productsTable): string
    {
        $defaultConnection = (string) config('database.default', 'mysql');
        $driver = (string) config("database.connections.{$defaultConnection}.driver", 'mysql');

        return $driver === 'sqlite'
            ? "trim(COALESCE(brands.name, '') || ' ' || COALESCE({$productsTable}.name, ''))"
            : "TRIM(CONCAT(COALESCE(brands.name, ''), ' ', COALESCE({$productsTable}.name, '')))";
    }

    private function orWhereBrandPlusProductNameLike(Builder $query, string $likePattern): void
    {
        $productsTable = (new Product())->getTable();
        $expr = $this->brandProductDisplayTitleSql($productsTable);
        $query->orWhereExists(function ($sub) use ($likePattern, $expr, $productsTable): void {
            $sub->from('brands')
                ->whereColumn('brands.id', "{$productsTable}.brand_id")
                ->whereRaw("{$expr} LIKE ?", [$likePattern]);
        });
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
            if (!isset($bCounts[$gram])) {
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

    private function applyCatalogBaseFilters(Builder $query, Request $request): void
    {
        if ($request->filled('brand')) {
            $brandIds = collect(explode(',', (string) $request->input('brand')))
                ->map(static fn (string $value): int => (int) trim($value))
                ->filter(static fn (int $value): bool => $value > 0)
                ->unique()
                ->values()
                ->all();

            if (!empty($brandIds)) {
                $query->whereIn('brand_id', $brandIds);
            }
        }

        if ($request->filled('brand_slug')) {
            $query->whereHas('brand', function ($brandQuery) use ($request): void {
                $brandQuery->where('slug', $request->string('brand_slug')->toString());
            });
        }
    }

    private function applyCatalogPriceFilters(Builder $query, Request $request): void
    {
        $minPrice = $request->filled('price_min') ? (float) $request->input('price_min') : null;
        $maxPrice = $request->filled('price_max') ? (float) $request->input('price_max') : null;

        if ($minPrice === null && $maxPrice === null) {
            return;
        }

        $query->whereHas('activeVariants', function ($variantQuery) use ($minPrice, $maxPrice): void {
            $variantQuery->whereNotNull('price');

            if ($minPrice !== null) {
                $variantQuery->where('price', '>=', $minPrice);
            }

            if ($maxPrice !== null) {
                $variantQuery->where('price', '<=', $maxPrice);
            }
        });
    }

    private function applyCatalogAttributeFilters(Builder $query, Request $request): void
    {
        $attributeFilters = collect($request->query())
            ->filter(function ($value, $key): bool {
                return is_string($key) && str_starts_with($key, 'attr_');
            });

        foreach ($attributeFilters as $key => $rawValue) {
            $attributeId = (int) str_replace('attr_', '', (string) $key);
            if ($attributeId <= 0) {
                continue;
            }

            $optionIds = collect(explode(',', (string) $rawValue))
                ->map(static fn (string $id): int => (int) trim($id))
                ->filter(static fn (int $id): bool => $id > 0)
                ->unique()
                ->values()
                ->all();

            if (empty($optionIds)) {
                continue;
            }

            $query->whereHas('attributeValues', function ($valueQuery) use ($attributeId, $optionIds): void {
                $valueQuery
                    ->where('product_attribute_id', $attributeId)
                    ->whereHas('selectedOptions', function ($selectedQuery) use ($optionIds): void {
                        $selectedQuery->whereIn('product_attribute_option_id', $optionIds);
                    });
            });
        }
    }

    private function applyCatalogVolumeFilters(Builder $query, Request $request): void
    {
        $keys = collect(explode(',', (string) $request->input('volume', '')))
            ->map(static fn (string $value): string => trim($value))
            ->filter(static fn (string $value): bool => $value !== '')
            ->unique()
            ->values()
            ->all();

        if (empty($keys)) {
            return;
        }

        $selectedBuckets = collect(self::VOLUME_BUCKETS)
            ->filter(static fn (array $bucket): bool => in_array($bucket['key'], $keys, true))
            ->values();

        if ($selectedBuckets->isEmpty()) {
            return;
        }

        $query->whereHas('activeVariants.definition', function ($definitionQuery) use ($selectedBuckets): void {
            $definitionQuery->where(function ($rangeQuery) use ($selectedBuckets): void {
                foreach ($selectedBuckets as $bucket) {
                    $rangeQuery->orWhere(function ($bucketQuery) use ($bucket): void {
                        $min = (int) ($bucket['min'] ?? 0);
                        $max = $bucket['max'];
                        $bucketQuery->whereNotNull('volume_ml')
                            ->where('volume_ml', '>=', $min);
                        if ($max !== null) {
                            $bucketQuery->where('volume_ml', '<=', (int) $max);
                        }
                    });
                }
            });
        });
    }

    private function smartSearchMeiliPoolLimit(int $responseLimit): int
    {
        $responseLimit = max(1, min($responseLimit, self::SMART_SEARCH_MAX_LIMIT));
        $computed = ($responseLimit * 6) + self::SMART_SEARCH_TYPO_EXTRA_LIMIT + 20;

        return max(
            self::SMART_SEARCH_MEILI_POOL_MIN,
            min($computed, self::SMART_SEARCH_MEILI_POOL_MAX),
        );
    }

    private function smartSearchCandidateLimit(int $limit): int
    {
        return max($limit + 8, ($limit * 3) + self::SMART_SEARCH_TYPO_EXTRA_LIMIT);
    }

    private function smartSearchWarehouseId(string $code): int
    {
        static $cache = [];

        if (!array_key_exists($code, $cache)) {
            $cache[$code] = (int) Warehouse::query()->where('code', $code)->value('id');
        }

        return $cache[$code];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Product>  $pool
     * @return \Illuminate\Support\Collection<int|string, \Illuminate\Support\Collection<int, WarehouseVariantStock>>
     */
    private function smartSearchLoadStocksByVariantId(
        $pool,
        int $mainWarehouseId,
        int $supplierWarehouseId,
    ): \Illuminate\Support\Collection {
        $activeVariantIds = $pool->flatMap(static function (Product $product): array {
            return $product->activeVariants->pluck('id')->map(static fn ($id): int => (int) $id)->all();
        })->unique()->values()->all();

        if ($activeVariantIds === []) {
            return collect();
        }

        return WarehouseVariantStock::query()
            ->whereIn('variant_id', $activeVariantIds)
            ->whereIn('warehouse_id', array_values(array_filter([$mainWarehouseId, $supplierWarehouseId])))
            ->get()
            ->groupBy('variant_id');
    }

    /**
     * @param  \Illuminate\Support\Collection<int, array<string, mixed>>  $rankedProducts
     * @return list<int>
     */
    private function smartSearchCandidateIdsFromRanked(
        $rankedProducts,
        int $candidateLimit,
        ?string $typoCorrectedQuery,
    ): array {
        return $this->smartSearchSortRankedProducts($rankedProducts)
            ->pipe(function ($sorted) use ($typoCorrectedQuery, $candidateLimit) {
                $nonTypo = $sorted->filter(
                    static fn (array $item): bool => (int) ($item['_match_tier'] ?? self::SMART_SEARCH_MATCH_TYPO) < self::SMART_SEARCH_MATCH_TYPO,
                );
                $typoProducts = $typoCorrectedQuery !== null
                    ? collect()
                    : $sorted->filter(
                        static fn (array $item): bool => (int) ($item['_match_tier'] ?? 0) === self::SMART_SEARCH_MATCH_TYPO,
                    )->take(self::SMART_SEARCH_TYPO_EXTRA_LIMIT);

                return $nonTypo
                    ->concat($typoProducts)
                    ->take($candidateLimit);
            })
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->values()
            ->all();
    }

    /**
     * @param  \Illuminate\Support\Collection<int, array<string, mixed>>  $rankedProducts
     * @return list<array<string, mixed>>
     */
    private function smartSearchFinalizeRankedProducts(
        $rankedProducts,
        int $limit,
        ?string $typoCorrectedQuery,
    ): array {
        $sorted = $this->smartSearchSortRankedProducts($rankedProducts);
        $nonTypo = $sorted->filter(
            static fn (array $item): bool => (int) ($item['_match_tier'] ?? self::SMART_SEARCH_MATCH_TYPO) < self::SMART_SEARCH_MATCH_TYPO,
        );
        $typoProducts = $typoCorrectedQuery !== null
            ? collect()
            : $sorted->filter(
                static fn (array $item): bool => (int) ($item['_match_tier'] ?? 0) === self::SMART_SEARCH_MATCH_TYPO,
            )->take(self::SMART_SEARCH_TYPO_EXTRA_LIMIT);

        return $nonTypo
            ->concat($typoProducts)
            ->take($limit)
            ->values()
            ->all();
    }

    /**
     * @param  \Illuminate\Support\Collection<int, array<string, mixed>>  $rankedProducts
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function smartSearchSortRankedProducts($rankedProducts): \Illuminate\Support\Collection
    {
        return $rankedProducts->sortBy([
            ['_match_tier', 'asc'],
            ['score', 'desc'],
            ['_availability_rank', 'desc'],
        ])->values();
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Product>  $pool
     * @param  array{
     *   normalizedQuery: string,
     *   typoCorrectedQuery: ?string,
     *   tokens: list<string>,
     *   mainWarehouseId: int,
     *   supplierWarehouseId: int,
     *   codeOrSkuBoostSet: array<int, bool>,
     *   matchedCodeByProductId: array<int, string>
     * } $context
     * @param  \Illuminate\Support\Collection<int|string, \Illuminate\Support\Collection<int, WarehouseVariantStock>>  $stocksByVariantId
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function smartSearchRankPoolProducts(
        $pool,
        array $context,
        \Illuminate\Support\Collection $stocksByVariantId,
        bool $roughAvailability,
    ): \Illuminate\Support\Collection {
        $normalizedQuery = $context['normalizedQuery'];
        $typoCorrectedQuery = $context['typoCorrectedQuery'];
        $tokens = $context['tokens'];
        $mainWarehouseId = $context['mainWarehouseId'];
        $supplierWarehouseId = $context['supplierWarehouseId'];
        $codeOrSkuBoostSet = $context['codeOrSkuBoostSet'];
        $matchedCodeByProductId = $context['matchedCodeByProductId'];

        return $pool->map(function (Product $product) use (
            $normalizedQuery,
            $typoCorrectedQuery,
            $tokens,
            $stocksByVariantId,
            $mainWarehouseId,
            $supplierWarehouseId,
            $codeOrSkuBoostSet,
            $matchedCodeByProductId,
            $roughAvailability,
        ) {
            $name = (string) $product->name;
            $slug = (string) $product->slug;
            $brandName = (string) ($product->brand?->name ?? '');
            $normalizedName = $this->normalizeSearchText($name);
            $normalizedSlug = $this->normalizeSearchText($slug);
            $normalizedBrand = $this->normalizeSearchText($brandName);
            $variantTitles = $product->variants
                ?->map(static fn ($variant) => (string) ($variant->definition?->title ?? ''))
                ->filter()
                ->unique()
                ->values() ?? collect();
            $prices = $product->variants
                ?->pluck('price')
                ->filter(static fn ($value) => $value !== null)
                ->map(static fn ($value) => (float) $value)
                ->values() ?? collect();
            $oldPrices = $product->variants
                ?->pluck('old_price')
                ->filter(static fn ($value) => $value !== null)
                ->map(static fn ($value) => (float) $value)
                ->values() ?? collect();
            $isPreorderAvailable = (bool) ($product->activeVariants?->contains(fn ($variant) => (bool) $variant->is_preorder) ?? false);

            if ($roughAvailability) {
                $listingStockTotal = (int) ($product->activeVariants?->sum(static fn ($variant): int => max(0, (int) $variant->stock)) ?? 0);
                $listingAvailableTotal = (int) ($product->activeVariants?->sum(static function ($variant): int {
                    return max(0, (int) $variant->stock - (int) ($variant->reserved_stock ?? 0));
                }) ?? 0);
            } else {
                $listingStockTotal = (int) ($product->activeVariants?->sum(function ($variant) use ($stocksByVariantId, $mainWarehouseId, $supplierWarehouseId): int {
                    $variantStocks = $stocksByVariantId->get($variant->id, collect())->keyBy('warehouse_id');
                    $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
                    $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
                    $row = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

                    return (int) $row['stock'];
                }) ?? 0);
                $listingAvailableTotal = (int) ($product->activeVariants?->sum(function ($variant) use ($stocksByVariantId, $mainWarehouseId, $supplierWarehouseId): int {
                    $variantStocks = $stocksByVariantId->get($variant->id, collect())->keyBy('warehouse_id');
                    $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
                    $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
                    $row = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

                    return (int) $row['available_stock'];
                }) ?? 0);
            }

            $mainImagePath = $product->images?->first()?->path;
            $minPrice = $prices->isEmpty() ? null : number_format((float) $prices->min(), 2, '.', '');
            $maxPrice = $prices->isEmpty() ? null : number_format((float) $prices->max(), 2, '.', '');
            $minOldPrice = $oldPrices->isEmpty() ? null : number_format((float) $oldPrices->min(), 2, '.', '');
            $maxOldPrice = $oldPrices->isEmpty() ? null : number_format((float) $oldPrices->max(), 2, '.', '');

            $normalizedDisplay = $this->normalizeSearchText(trim($brandName.' '.$name));
            $scoreDisplay = $normalizedDisplay !== ''
                ? $this->similarityScore($normalizedQuery, $normalizedDisplay)
                : 0.0;
            if (
                $normalizedDisplay !== ''
                && $normalizedQuery !== ''
                && str_contains($normalizedDisplay, $normalizedQuery)
            ) {
                $scoreDisplay = max($scoreDisplay, 0.98);
            }

            $scoreName = $this->similarityScore($normalizedQuery, $normalizedName);
            $scoreSlug = $this->similarityScore($normalizedQuery, $normalizedSlug);
            $scoreBrand = $brandName !== '' ? $this->similarityScore($normalizedQuery, $normalizedBrand) : 0.0;
            $scoreVariant = $variantTitles->reduce(function (float $carry, $variantTitle) use ($normalizedQuery) {
                $score = $this->similarityScore($normalizedQuery, $this->normalizeSearchText((string) $variantTitle));

                return max($carry, $score);
            }, 0.0);

            $bestScore = max(
                $scoreName,
                $scoreSlug * 0.95,
                $scoreBrand * 1.05,
                $scoreVariant * 0.9,
                $scoreDisplay * 1.08
            );
            $isCodeBoost = isset($codeOrSkuBoostSet[$product->id]);
            if ($isCodeBoost) {
                $bestScore = max($bestScore, 1.0);
            }

            $normalizedDisplay = trim($normalizedBrand !== '' ? $normalizedBrand.' '.$normalizedName : $normalizedName);
            $matchTier = $this->smartSearchResolveProductMatchTier(
                $normalizedQuery,
                $tokens,
                $normalizedDisplay,
                $typoCorrectedQuery,
                $isCodeBoost,
            );
            $typoPhrase = null;
            if ($matchTier === null && $typoCorrectedQuery === null) {
                $typoPhrase = $this->smartSearchExtractTypoPhrase($normalizedQuery, $normalizedDisplay);
                if ($typoPhrase !== null) {
                    $matchTier = self::SMART_SEARCH_MATCH_TYPO;
                }
            }

            if ($matchTier === null) {
                return null;
            }

            return [
                'id' => (int) $product->id,
                'name' => $name,
                'display_name' => \Modules\Catalog\Support\ProductDisplayName::format($brandName, $name),
                'slug' => $slug,
                'brand_name' => $brandName !== '' ? $brandName : null,
                'variant_titles' => $variantTitles->take(3)->all(),
                'h1' => null,
                'short_description' => null,
                'brand' => $product->brand ? [
                    'id' => (int) $product->brand->id,
                    'name' => (string) $product->brand->name,
                ] : null,
                'main_category' => null,
                'image' => $mainImagePath ? (string) $mainImagePath : null,
                'is_new' => (bool) $product->is_new,
                'is_hit' => (bool) $product->is_hit,
                'is_out_of_stock' => (bool) $product->is_out_of_stock,
                'price_range' => [
                    'min' => $minPrice,
                    'max' => $maxPrice,
                ],
                'old_price_range' => [
                    'min' => $minOldPrice,
                    'max' => $maxOldPrice,
                ],
                'has_discount' => !$prices->isEmpty() && !$oldPrices->isEmpty() && (float) $oldPrices->min() > (float) $prices->min(),
                'discount_percent' => null,
                'stock_total' => $listingStockTotal,
                'is_preorder_available' => $isPreorderAvailable,
                'variants_count' => (int) ($product->variants?->count() ?? 0),
                'variant_labels' => $variantTitles->values()->all(),
                'matched_code' => $matchedCodeByProductId[(int) $product->id] ?? null,
                '_availability_rank' => ($listingAvailableTotal > 0 || $isPreorderAvailable) ? 1 : 0,
                '_match_tier' => $matchTier,
                '_typo_phrase' => $typoPhrase,
                'score' => round($bestScore, 6),
            ];
        })->filter();
    }

    /**
     * @return list<string>
     */
    private function smartSearchProductColumns(): array
    {
        return ['id', 'brand_id', 'name', 'slug', 'is_new', 'is_hit', 'is_out_of_stock'];
    }

    private function smartSearchLegacyProductQuery(): Builder
    {
        return Product::query()
            ->where('is_active', true)
            ->with($this->smartSearchProductRelations(includeImages: true));
    }

    private function smartSearchRankingProductQuery(): Builder
    {
        return Product::query()
            ->where('is_active', true)
            ->with($this->smartSearchProductRelations(includeImages: false));
    }

    /**
     * @return array<string, mixed>
     */
    private function smartSearchProductRelations(bool $includeImages): array
    {
        $relations = [
            'brand:id,name',
            'variants' => static function ($q): void {
                $q->select('id', 'product_id', 'variant_definition_id', 'price', 'old_price', 'stock', 'reserved_stock', 'is_preorder', 'is_active')
                    ->with(['definition:id,title']);
            },
            'activeVariants' => static function ($q): void {
                $q->select('id', 'product_id', 'variant_definition_id', 'price', 'old_price', 'stock', 'reserved_stock', 'is_preorder', 'is_active')
                    ->with(['definition:id,title']);
            },
        ];

        if ($includeImages) {
            $relations['images'] = ProductListResource::imagesForListingEagerLoad();
        }

        return $relations;
    }

    /**
     * @param  list<int>  $meiliIds
     * @param  list<string>  $columns
     * @return \Illuminate\Support\Collection<int, Product>
     */
    private function smartSearchFetchProductsByMeiliIds(Builder $query, array $meiliIds, array $columns): \Illuminate\Support\Collection
    {
        if ($meiliIds === []) {
            return collect();
        }

        return (clone $query)
            ->whereIn('id', $meiliIds)
            ->get($columns)
            ->sortBy(static function (Product $product) use ($meiliIds): int {
                $index = array_search((int) $product->id, $meiliIds, true);

                return $index === false ? PHP_INT_MAX : (int) $index;
            })
            ->values();
    }

    /**
     * @param  list<array<string, mixed>>  $rankedProducts
     * @return list<array<string, mixed>>
     */
    private function smartSearchAttachImagesToRankedProducts(array $rankedProducts): array
    {
        if ($rankedProducts === []) {
            return $rankedProducts;
        }

        $productIds = array_values(array_unique(array_map(
            static fn (array $item): int => (int) ($item['id'] ?? 0),
            $rankedProducts,
        )));
        $productIds = array_values(array_filter($productIds, static fn (int $id): bool => $id > 0));
        if ($productIds === []) {
            return $rankedProducts;
        }

        $pathsByProductId = Product::query()
            ->whereIn('id', $productIds)
            ->with(['images' => ProductListResource::imagesForListingEagerLoad()])
            ->get(['id'])
            ->mapWithKeys(static function (Product $product): array {
                $path = $product->images?->first()?->path;

                return [(int) $product->id => $path ? (string) $path : null];
            });

        return array_map(static function (array $item) use ($pathsByProductId): array {
            $productId = (int) ($item['id'] ?? 0);
            if ($productId > 0) {
                $item['image'] = $pathsByProductId->get($productId);
            }

            return $item;
        }, $rankedProducts);
    }

}
