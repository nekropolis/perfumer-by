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
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogProductQueryFilters;
use Modules\Catalog\Support\CatalogSearchScoring;
use Modules\Catalog\Support\CatalogListingStockContext;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Services\CatalogBootstrapService;
use Modules\Catalog\Services\CatalogFiltersService;
use Modules\Catalog\Services\CatalogProductsListingService;
use Modules\Catalog\Services\ProductViewService;
use Modules\Catalog\Services\SimilarProductsService;
use Modules\Catalog\Services\SmartSearch\ProductSearchRetrievalService;
use Modules\Reviews\Services\PublishedProductReviewsService;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

class ProductController extends Controller
{
    public function __construct(
        private CatalogApiCacheService $cacheService,
        private CatalogProductsListingService $listingService,
        private CatalogBootstrapService $bootstrapService,
        private CatalogFiltersService $filtersService,
        private SimilarProductsService $similarProductsService,
        private ProductViewService $productViewService,
        private ProductSearchRetrievalService $searchRetrievalService,
        private PublishedProductReviewsService $reviewsService,
    ) {
    }

    private const int SMART_SEARCH_POOL_LIMIT = 900;
    /** Товары с прямым вхождением полной строки запроса — не вытесняются «новыми» ID из общего пула. */
    private const int SMART_SEARCH_DIRECT_MATCH_LIMIT = 600;
    private const int SMART_SEARCH_RESULT_LIMIT = 10;
    private const int SMART_SEARCH_MAX_LIMIT = 30;
    private const int SMART_SEARCH_PAGE_PER_PAGE = 24;
    /** Товары с опечаткой в запросе (1 буква в слове) — после точных, не более 5. */
    private const int SMART_SEARCH_TYPO_EXTRA_LIMIT = 5;
    /** Meili fast path: минимальный pool для PHP-ранжирования (не legacy 900). */
    private const int SMART_SEARCH_MEILI_POOL_MIN = 48;
    private const int SMART_SEARCH_MEILI_POOL_MAX = 120;
    private const int SMART_SEARCH_MEILI_REQUEST_MAX = 200;
    private const int SMART_SEARCH_MATCH_EXACT = 0;
    /** Слова запроса подряд в названии: «Azzaro Night …». */
    private const int SMART_SEARCH_MATCH_CONSECUTIVE = 1;
    /** Слова запроса по порядку, не обязательно рядом: «Azzaro … Night». */
    private const int SMART_SEARCH_MATCH_SEQUENTIAL = 2;
    /** Все слова запроса в названии, порядок любой. */
    private const int SMART_SEARCH_MATCH_SCATTERED = 3;
    private const int SMART_SEARCH_MATCH_TYPO = 4;

    private const float SCORE_WEIGHT_SLUG = 0.95;
    private const float SCORE_WEIGHT_BRAND = 1.05;
    private const float SCORE_WEIGHT_VARIANT = 0.9;
    private const float SCORE_WEIGHT_DISPLAY = 1.08;
    private const float SCORE_CONTAINS_BONUS = 0.98;

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
        'is_promotion',
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
        'volume_label',
        'concentration_code',
        'concentration_label',
        'is_tester',
        'is_vial',
        'is_miniature',
        'is_set',
        'title',
    ];

    public function index(Request $request): JsonResponse
    {
        $payload = $this->cacheService->rememberProducts($request->query(), function () use ($request): array {
            return $this->listingService->list($request);
        });

        return response()->json($payload);
    }

    public function bootstrap(Request $request): JsonResponse
    {
        $startedAt = microtime(true);
        $cached = $this->cacheService->rememberBootstrapWithMeta(
            $request->query(),
            fn (): array => $this->bootstrapService->buildWithMetrics($request),
        );

        $payload = $cached['payload'];

        if ($payload === null) {
            return response()->json([
                'message' => 'Бренд не найден.',
            ], 404);
        }

        $response = response()->json([
            'data' => $payload,
        ]);

        $response->headers->set('X-Catalog-Cache', $cached['hit'] ? 'HIT' : 'MISS');

        $timingParts = [];
        if ($cached['hit']) {
            $timingParts[] = sprintf('bootstrap;dur="%.2f";desc="HIT"', (microtime(true) - $startedAt) * 1000);
        } else {
            $timingsMs = $cached['timings_ms'] ?? [];
            $cacheParts = $cached['cache_parts'] ?? [];
            foreach (['products', 'filters', 'brands', 'brand', 'total'] as $section) {
                if (!isset($timingsMs[$section])) {
                    continue;
                }

                $desc = $cacheParts[$section] ?? 'MISS';
                $timingParts[] = sprintf('%s;dur="%.2f";desc="%s"', $section, $timingsMs[$section], $desc);
            }
        }

        if ($timingParts !== []) {
            $response->headers->set('Server-Timing', implode(', ', $timingParts));
        }

        $totalMs = (microtime(true) - $startedAt) * 1000;
        if ($totalMs >= 1000) {
            Log::warning('catalog.bootstrap.slow', [
                'cache' => $cached['hit'] ? 'HIT' : 'MISS',
                'total_ms' => round($totalMs, 2),
                'query' => $request->query(),
                'timings_ms' => $cached['timings_ms'] ?? null,
                'cache_parts' => $cached['cache_parts'] ?? null,
            ]);
        }

        return $response;
    }

    public function filters(Request $request): JsonResponse
    {
        $payload = $this->cacheService->rememberCatalogFilters(
            CatalogProductQueryFilters::facetCacheQueryParams($request),
            function () use ($request): array {
                return $this->filtersService->build($request);
            },
        );

        return response()->json($payload);
    }

    public function show(string $slug): JsonResponse
    {
        $payload = $this->cacheService->rememberProductBySlug($slug, function () use ($slug): array {
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
                    'is_set',
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
                    'sets.components',
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
                                'productSet.components',
                            ]);
                    },
                ])
                ->first();

            if ($product === null) {
                return [];
            }

            CatalogListingStockContext::prime(collect([$product]));

            try {
                $detail = (new ProductDetailResource($product))->resolve();
            } finally {
                CatalogListingStockContext::forget();
            }

            return [
                'data' => $detail,
                'reviews' => [
                    'data' => $this->reviewsService->listForProduct((int) $product->id),
                ],
            ];
        });

        if (!isset($payload['data'])) {
            return response()->json([
                'message' => 'Товар не найден.',
            ], 404);
        }

        return response()->json($payload);
    }

    public function similarProducts(Request $request, string $slug): JsonResponse
    {
        $limit = max(4, min(24, (int) $request->input('limit', 8)));

        $payload = $this->cacheService->rememberProductSimilarBySlug($slug, $limit, function () use ($slug, $limit): ?array {
            $product = Product::query()
                ->where('slug', $slug)
                ->where('is_active', true)
                ->first(['id']);

            if ($product === null) {
                return null;
            }

            $ids = $this->similarProductsService->similarProductIds((int) $product->id, $limit);
            $similar = $this->listingService->hydrateOrderedListingProducts($ids);

            return [
                'data' => ProductListResource::resolveCollection($similar),
            ];
        });

        if ($payload === null) {
            return response()->json([
                'message' => 'Товар не найден.',
            ], 404);
        }

        return response()->json($payload);
    }

    public function recordView(Request $request, int $id): \Illuminate\Http\Response
    {
        $this->productViewService->record($id, $request);

        return response()->noContent();
    }

    public function homeRecommended(): JsonResponse
    {
        $ids = $this->productViewService->snapshotProductIds();
        $products = $this->listingService->hydrateOrderedListingProducts($ids);

        if ($products->count() < ProductViewService::MIN_TO_SHOW) {
            return response()->json([
                'data' => [],
            ]);
        }

        return response()->json([
            'data' => ProductListResource::resolveCollection($products),
        ]);
    }

    public function brands(): JsonResponse
    {
        $brands = $this->cacheService->rememberBrands(static function () {
            $query = Brand::query()->where('is_active', true);
            CatalogProductQueryFilters::applyStorefrontBrandVisibilityFilter($query);

            return $query
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
        $payload = $this->cacheService->rememberBrandBySlug($slug, function () use ($slug) {
            $query = Brand::query()
                ->where('slug', $slug)
                ->where('is_active', true);
            CatalogProductQueryFilters::applyStorefrontBrandVisibilityFilter($query);

            $row = $query->first([
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
        $paginationRequested = $request->has('page');
        $page = max(1, (int) $request->input('page', 1));
        $perPage = $paginationRequested
            ? max(1, min((int) $request->input('limit', self::SMART_SEARCH_PAGE_PER_PAGE), self::SMART_SEARCH_PAGE_PER_PAGE))
            : max(1, min((int) $request->input('limit', self::SMART_SEARCH_RESULT_LIMIT), self::SMART_SEARCH_MAX_LIMIT));
        $finalizeLimit = $paginationRequested ? self::SMART_SEARCH_POOL_LIMIT : $perPage;
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
            $responseCacheTtl = max(5, (int) config('services.catalog_search.response_cache_ttl_seconds', 120));
            $responseCacheKey = sprintf(
                'catalog:smart-search:response:v%s:%s:%s',
                $this->cacheService->searchVersion(),
                md5(mb_strtolower($query, 'UTF-8')),
                $paginationRequested ? "{$perPage}:{$page}" : (string) $perPage,
            );
            $cachedResponse = Cache::get($responseCacheKey);
            if (is_array($cachedResponse)) {
                return response()->json($cachedResponse);
            }
        }

        $normalizedQuery = CatalogSearchScoring::normalizeSearchText($query);
        $tokens = CatalogSearchScoring::splitWords($normalizedQuery);
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

        $queryLike = '%'.CatalogSearchScoring::escapeLikeValue($query).'%';
        $patternLikes = array_map(
            fn (string $pattern): string => '%'.CatalogSearchScoring::escapeLikeValue($pattern).'%',
            $searchPatterns
        );

        $meiliPoolLimit = $paginationRequested
            ? min(self::SMART_SEARCH_POOL_LIMIT, self::SMART_SEARCH_MEILI_REQUEST_MAX)
            : $this->smartSearchMeiliPoolLimit($perPage);
        $productColumns = $this->smartSearchProductColumns();
        $legacyProductQuery = $this->smartSearchLegacyProductQuery();
        $rankingProductQuery = $this->smartSearchRankingProductQuery();
        $phaseOneProductQuery = $this->smartSearchPhaseOneProductQuery();
        $usesLightweightPool = false;
        $typoCorrectedQuery = null;

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
            $meiliResult = $this->searchRetrievalService->searchProductIds($query, $meiliPoolLimit);
            $meiliIds = $meiliResult['ids'] ?? [];
        }

        $searchBackend = (string) ($meiliResult['source'] ?? 'legacy');

        if (
            !in_array($searchBackend, ['meilisearch', 'code_lookup'], true)
            || $meiliIds === []
        ) {
            $typoCorrectedQuery = $this->resolveTypoCorrectedQuery($normalizedQuery, $tokens);
        }

        if ($meiliIds !== []) {
            $usesLightweightPool = $searchBackend !== 'legacy';
            if ($usesLightweightPool) {
                $meiliIds = array_slice($meiliIds, 0, $meiliPoolLimit);
            }
            $poolQueryForIds = $usesLightweightPool ? $phaseOneProductQuery : $legacyProductQuery;
            $pool = $this->smartSearchFetchProductsByMeiliIds($poolQueryForIds, $meiliIds, $productColumns);
        } else {
            $poolQuery = (clone $legacyProductQuery)->where(function ($q) use ($queryLike, $patternLikes, $query): void {
                $this->applyProductLikeFilters($q, $queryLike);
                foreach ($patternLikes as $like) {
                    $this->applyProductLikeFilters($q, $like);
                }
                $this->orWhereProductIdOrSupplierSku($q, $query, $queryLike);
            });

            $directMatchQuery = (clone $legacyProductQuery)->where(function ($q) use ($queryLike, $query): void {
                $this->applyProductLikeFilters($q, $queryLike);
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

            $pool = $directPool->merge($broadPool)->unique('id');
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

        if (count($tokens) >= 2) {
            $tokenPoolQuery = $usesLightweightPool ? $rankingProductQuery : $legacyProductQuery;
            $pool = $this->mergeSmartSearchPoolForAllTokens($pool, $tokenPoolQuery, $tokens);
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
                $pool = $pool->merge($extraPool)->unique('id');
            }
        }

        if ($paginationRequested) {
            $pool = $this->mergeSmartSearchPoolForMatchedBrands(
                $pool,
                $usesLightweightPool ? $phaseOneProductQuery : $legacyProductQuery,
                $query,
                $tokens,
                $normalizedQuery,
                $productColumns,
            );
        }

        $codeOrSkuBoostSet = array_fill_keys($codeOrSkuBoostIds, true);
        $matchedCodeByProductId = ($isCodeLikeQuery || $isStrictNumericQuery || $codeOrSkuBoostIds !== [])
            ? $this->matchedCodeByProductId($query, $pool->pluck('id')->map(static fn ($id): int => (int) $id)->all())
            : [];

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
                phaseOneScoring: true,
            );
            $candidateIds = $this->smartSearchCandidateIdsFromRanked(
                $phaseOneRanked,
                $paginationRequested ? $finalizeLimit : $this->smartSearchCandidateLimit($perPage),
                $typoCorrectedQuery,
            );
            $candidatePool = $this->smartSearchFetchProductsByMeiliIds(
                $rankingProductQuery,
                $candidateIds,
                $productColumns,
            );
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
                phaseOneScoring: false,
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
            $finalizeLimit,
            $typoCorrectedQuery,
        );

        if ($usesLightweightPool) {
            $rankedProducts = $this->smartSearchAttachImagesToRankedProducts($rankedProducts);
        }

        $productResultCount = count($rankedProducts);
        $productsMeta = null;
        if ($paginationRequested) {
            $offset = ($page - 1) * $perPage;
            $rankedProducts = array_slice($rankedProducts, $offset, $perPage);
            $productsMeta = [
                'total' => $productResultCount,
                'per_page' => $perPage,
                'current_page' => $page,
                'last_page' => max(1, (int) ceil($productResultCount / $perPage)),
            ];
        }

        $rankedBrands = $this->buildSmartSearchRankedBrands($query, $tokens, $normalizedQuery);

        $rankedProducts = array_map(static function (array $item) use ($debug): array {
            unset($item['_availability_rank'], $item['_match_tier'], $item['_typo_phrase']);
            if (!$debug) {
                unset($item['score']);
            }

            return $item;
        }, $rankedProducts);
        $rankedBrands = array_map(static function (array $item) use ($debug): array {
            if (!$debug) {
                unset($item['score']);
            }

            return $item;
        }, $rankedBrands);

        $response = [
            'data' => [
                'brands' => $rankedBrands,
                'products' => $rankedProducts,
                'suggested_query' => ($typoCorrectedQuery !== null
                    && $typoCorrectedQuery !== $normalizedQuery
                    && $productResultCount > 0)
                    ? $typoCorrectedQuery
                    : null,
            ],
        ];
        if ($productsMeta !== null) {
            $response['meta'] = $productsMeta;
        }
        if ($debug) {
            $response['debug'] = [
                'query' => $query,
                'normalized_query' => $normalizedQuery,
                'tokens' => $tokens,
                'search_patterns' => $searchPatterns,
                'product_pool_count' => $pool->count(),
                'brand_result_count' => count($rankedBrands),
                'product_result_count' => $productResultCount,
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
            $targetP95Ms = !$paginationRequested && $perPage <= 16
                ? (int) config('catalog_search.slo.header_p95_ms', 250)
                : (int) config('catalog_search.slo.search_page_p95_ms', 450);

            try {
                Log::info('catalog.smart_search', [
                    'query' => $query,
                    'has_results' => ($productResultCount + count($rankedBrands)) > 0,
                    'brand_count' => count($rankedBrands),
                    'product_count' => $productResultCount,
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
            } catch (\Throwable) {
                // Metrics logging must not break the search response.
            }
        }

        if ($responseCacheKey !== null && $responseCacheTtl > 0) {
            Cache::put($responseCacheKey, $response, $responseCacheTtl);
        }

        return response()->json($response);
    }

    private function applyProductLikeFilters(Builder $q, string $like): void
    {
        $q->where('name', 'like', $like)
            ->orWhere('slug', 'like', $like)
            ->orWhereHas('brand', function ($bq) use ($like): void {
                $bq->where('name', 'like', $like)->orWhere('slug', 'like', $like);
            })
            ->orWhereHas('variants.definition', function ($vq) use ($like): void {
                $vq->where('title', 'like', $like);
            });
        $this->orWhereBrandPlusProductNameLike($q, $like);
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
            $fromSkuOrExternal = SupplierVariantOffer::query()
                ->where('supplier_variant_offers.is_active', true)
                ->where(function ($q) use ($like): void {
                    $q->whereNotNull('supplier_variant_offers.sku')
                        ->where('supplier_variant_offers.sku', 'like', $like)
                        ->orWhereNotNull('supplier_variant_offers.external_id')
                        ->where('supplier_variant_offers.external_id', 'like', $like);
                })
                ->join('product_variant_links', 'product_variant_links.id', '=', 'supplier_variant_offers.product_variant_id')
                ->join('products', 'products.id', '=', 'product_variant_links.product_id')
                ->where('products.is_active', true)
                ->select('products.id')
                ->distinct()
                ->pluck('products.id');
            $ids = $ids->merge($fromSkuOrExternal);
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
     * Страница поиска: все активные товары брендов, совпавших по названию (например «Dolce» → Dolce&Gabbana).
     *
     * @param  \Illuminate\Support\Collection<int, Product>  $pool
     * @param  list<string>  $tokens
     * @param  list<string>  $productColumns
     * @return \Illuminate\Support\Collection<int, Product>
     */
    private function mergeSmartSearchPoolForMatchedBrands(
        $pool,
        Builder $baseProductQuery,
        string $query,
        array $tokens,
        string $normalizedQuery,
        array $productColumns,
    ) {
        $matchedBrands = $this->smartSearchBrandsDirectMatch($query, $tokens, $normalizedQuery, 5);
        if ($matchedBrands === []) {
            return $pool;
        }

        $remaining = self::SMART_SEARCH_POOL_LIMIT - $pool->count();
        if ($remaining <= 0) {
            return $pool;
        }

        $brandIds = array_map(static fn (array $brand): int => (int) $brand['id'], $matchedBrands);
        $existingIds = $pool->pluck('id')->all();

        $brandProducts = (clone $baseProductQuery)
            ->whereIn('brand_id', $brandIds)
            ->when($existingIds !== [], fn (Builder $q) => $q->whereKeyNot($existingIds))
            ->orderByDesc('id')
            ->limit($remaining)
            ->get($productColumns);

        return $pool->merge($brandProducts)->unique('id')->values();
    }

    /**
     * Товар в выдаче: запрос как подстрока в «бренд + название» (как на витрине).
     * Для однословного запроса — отдельное слово в названии товара.
     * Для нескольких слов — только целая фраза, не разрозненные токены
     * (иначе «the one» матчит «Take One To The Moon»).
     *
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
        $correctedLike = '%'.CatalogSearchScoring::escapeLikeValue($normalizedQuery).'%';

        $sqlPool = (clone $baseProductQuery)
            ->where(function ($q) use ($correctedLike): void {
                $q->where('name', 'like', $correctedLike)
                    ->orWhere('slug', 'like', $correctedLike);
                $this->orWhereBrandPlusProductNameLike($q, $correctedLike);
            })
            ->orderByDesc('id')
            ->limit(self::SMART_SEARCH_DIRECT_MATCH_LIMIT)
            ->get($columns);

        $pool = $pool->merge($sqlPool);

        if (!$isStrictNumericQuery) {
            $correctedMeili = $this->searchRetrievalService->searchProductIds(
                $normalizedQuery,
                $meiliPoolLimit,
            );
            $correctedIds = array_slice($correctedMeili['ids'] ?? [], 0, $meiliPoolLimit);
            if ($correctedIds !== []) {
                $meiliPool = $this->smartSearchFetchProductsByMeiliIds($baseProductQuery, $correctedIds, $columns);
                $pool = $pool->merge($meiliPool);
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

        $like = '%'.CatalogSearchScoring::escapeLikeValue($normalizedPhrase).'%';

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

        if ($normalizedDisplay === $normalizedQuery) {
            return self::SMART_SEARCH_MATCH_EXACT;
        }

        if (str_starts_with($normalizedDisplay, $normalizedQuery)) {
            $tail = mb_substr($normalizedDisplay, mb_strlen($normalizedQuery, 'UTF-8'), null, 'UTF-8');
            if ($tail === '' || preg_match('/^\s/u', $tail) === 1) {
                return self::SMART_SEARCH_MATCH_CONSECUTIVE;
            }
        }

        if (
            ($typoCorrectedQuery !== null && str_contains($normalizedDisplay, $typoCorrectedQuery))
            || str_contains($normalizedDisplay, $normalizedQuery)
        ) {
            return self::SMART_SEARCH_MATCH_CONSECUTIVE;
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
     * Слова запроса подряд в названии.
     *
     * @param  list<string>  $tokens
     */
    private function smartSearchTokensMatchConsecutive(array $tokens, string $normalizedDisplay): bool
    {
        $displayWords = CatalogSearchScoring::splitWords($normalizedDisplay);
        $count = count($tokens);
        if ($count === 0 || count($displayWords) < $count) {
            return false;
        }

        for ($i = 0; $i <= count($displayWords) - $count; $i++) {
            $window = array_slice($displayWords, $i, $count);
            $matches = true;
            foreach ($tokens as $index => $token) {
                if (! $this->smartSearchTokenMatchesDisplayWord($token, (string) $window[$index])) {
                    $matches = false;
                    break;
                }
            }
            if ($matches) {
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
        $displayWords = CatalogSearchScoring::splitWords($normalizedDisplay);
        if ($displayWords === []) {
            return false;
        }

        $tokenIndex = 0;
        foreach ($displayWords as $word) {
            if (! $this->smartSearchTokenMatchesDisplayWord($tokens[$tokenIndex], $word)) {
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
            $like = '%'.CatalogSearchScoring::escapeLikeValue($token).'%';
            $tokenPoolQuery->where(function (Builder $q) use ($like): void {
                $this->applyProductLikeFilters($q, $like);
            });
        }

        $tokenPool = $tokenPoolQuery
            ->orderByDesc('id')
            ->limit(self::SMART_SEARCH_POOL_LIMIT)
            ->get($columns);

        return $pool->merge($tokenPool)->unique('id')->values();
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

        $queryWords = CatalogSearchScoring::splitWords($normalizedQuery);
        $displayWords = CatalogSearchScoring::splitWords($normalizedDisplay);
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

        $queryLike = '%'.CatalogSearchScoring::escapeLikeValue($query).'%';

        return Brand::query()
            ->where('is_active', true)
            ->where(function ($q) use ($queryLike): void {
                $q->where('name', 'like', $queryLike)
                    ->orWhere('slug', 'like', $queryLike);
            })
            ->withCount(['products as products_count' => fn ($q) => $q->where('is_active', true)])
            ->get(['id', 'name', 'slug'])
            ->filter(function (Brand $brand) use ($significantTokens, $normalizedQuery): bool {
                return $this->brandMatchesTokens($brand, $significantTokens)
                    && $this->brandScore($brand, $normalizedQuery) >= 0.45;
            })
            ->sortByDesc(function (Brand $brand) use ($normalizedQuery): float {
                return $this->brandScore($brand, $normalizedQuery);
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

    private function brandMatchesTokens(Brand $brand, array $tokens): bool
    {
        $normalizedBrandName = CatalogSearchScoring::normalizeSearchText((string) $brand->name);
        $normalizedBrandSlug = CatalogSearchScoring::normalizeSearchText((string) $brand->slug);

        return $this->matchesAllTokensAsWords($normalizedBrandName, $tokens)
            || $this->matchesAllTokensAsWords($normalizedBrandSlug, $tokens);
    }

    private function brandScore(Brand $brand, string $normalizedQuery): float
    {
        return max(
            CatalogSearchScoring::similarityScore($normalizedQuery, CatalogSearchScoring::normalizeSearchText((string) $brand->name)),
            CatalogSearchScoring::similarityScore($normalizedQuery, CatalogSearchScoring::normalizeSearchText((string) $brand->slug)) * self::SCORE_WEIGHT_SLUG,
        );
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

        foreach ($tokens as $token) {
            if (mb_strlen($token, 'UTF-8') < 2) {
                continue;
            }
            $tokenMatched = false;
            foreach (CatalogSearchScoring::splitWords($normalizedHaystack) as $word) {
                if ($this->smartSearchTokenMatchesDisplayWord($token, $word)) {
                    $tokenMatched = true;
                    break;
                }
            }
            if (!$tokenMatched) {
                return false;
            }
        }

        return true;
    }

    /**
     * Токен совпадает с целым словом или является достаточным префиксом («nor» → «norana», «mo» → «moon»).
     */
    private function smartSearchTokenMatchesDisplayWord(string $token, string $word): bool
    {
        if ($token === '' || $word === '') {
            return false;
        }

        if ($token === $word) {
            return true;
        }

        $tokenLength = mb_strlen($token, 'UTF-8');
        $wordLength = mb_strlen($word, 'UTF-8');
        if ($tokenLength < 2 || $wordLength < $tokenLength) {
            return false;
        }

        if (! str_starts_with($word, $token)) {
            return false;
        }

        return $tokenLength >= 3 || $tokenLength >= (int) ceil($wordLength * 0.45);
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

    private function smartSearchMeiliPoolLimit(int $responseLimit): int
    {
        $responseLimit = max(1, min($responseLimit, self::SMART_SEARCH_MAX_LIMIT));
        $computed = ($responseLimit * 3) + self::SMART_SEARCH_TYPO_EXTRA_LIMIT + 16;

        return max(
            self::SMART_SEARCH_MEILI_POOL_MIN,
            min($computed, self::SMART_SEARCH_MEILI_POOL_MAX),
        );
    }

    private function smartSearchCandidateLimit(int $limit): int
    {
        return max($limit + 6, ($limit * 2) + self::SMART_SEARCH_TYPO_EXTRA_LIMIT);
    }

    private function smartSearchWarehouseId(string $code): int
    {
        return (int) Cache::remember("catalog:warehouse:{$code}", 3600, function () use ($code) {
            return Warehouse::query()->where('code', $code)->value('id') ?? 0;
        });
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
                    ->merge($typoProducts)
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
            ->merge($typoProducts)
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
        return $rankedProducts->sort(function (array $left, array $right): int {
            $tierCompare = (int) ($left['_match_tier'] ?? 99) <=> (int) ($right['_match_tier'] ?? 99);
            if ($tierCompare !== 0) {
                return $tierCompare;
            }

            $availabilityCompare = (int) ($right['_availability_rank'] ?? 0) <=> (int) ($left['_availability_rank'] ?? 0);
            if ($availabilityCompare !== 0) {
                return $availabilityCompare;
            }

            $scoreCompare = ((float) ($right['score'] ?? 0)) <=> ((float) ($left['score'] ?? 0));
            if ($scoreCompare !== 0) {
                return $scoreCompare;
            }

            $lenCompare = (int) ($left['_display_label_len'] ?? 0) <=> (int) ($right['_display_label_len'] ?? 0);
            if ($lenCompare !== 0) {
                return $lenCompare;
            }

            return (int) ($left['id'] ?? 0) <=> (int) ($right['id'] ?? 0);
        })->values();
    }

    private function smartSearchAvailabilityRank(
        Product $product,
        int $listingAvailableTotal,
        bool $phaseOneScoring,
    ): int {
        if (!$phaseOneScoring && $listingAvailableTotal > 0) {
            return 1;
        }

        return $product->is_out_of_stock ? 0 : 1;
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
        bool $phaseOneScoring = false,
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
            $phaseOneScoring,
        ) {
            $name = (string) $product->name;
            $slug = (string) $product->slug;
            $brandName = (string) ($product->brand?->name ?? '');
            $normalizedName = CatalogSearchScoring::normalizeSearchText($name);
            $normalizedSlug = CatalogSearchScoring::normalizeSearchText($slug);
            $normalizedBrand = CatalogSearchScoring::normalizeSearchText($brandName);
            if ($phaseOneScoring) {
                $variantTitles = collect();
                $prices = collect();
                $oldPrices = collect();
                $isPreorderAvailable = false;
                $listingStockTotal = 0;
                $listingAvailableTotal = $product->is_out_of_stock ? 0 : 1;
            } else {
            $variantTitles = $product->variants
                ?->map(static fn ($variant) => (string) ($variant->definition?->title ?? ''))
                ->filter()
                ->unique()
                ->values() ?? collect();
            // Как витрина: цена только если вариант реально доступен на listing.
            $prices = $product->activeVariants
                ?->map(function ($variant) use ($stocksByVariantId, $mainWarehouseId, $supplierWarehouseId, $roughAvailability) {
                    if ($roughAvailability) {
                        $available = max(0, (int) $variant->stock - (int) ($variant->reserved_stock ?? 0));
                        if ($available <= 0 && !(bool) $variant->is_preorder) {
                            return null;
                        }

                        return $variant->price !== null && is_numeric((string) $variant->price) && (float) $variant->price > 0
                            ? (float) $variant->price
                            : null;
                    }

                    $variantStocks = $stocksByVariantId->get($variant->id, collect())->keyBy('warehouse_id');
                    $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
                    $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
                    $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);

                    return CatalogVariantStockPresenter::storefrontVariantPrice($variant, $presented);
                })
                ->filter(static fn ($value) => $value !== null && (float) $value > 0)
                ->map(static fn ($value) => (float) $value)
                ->values() ?? collect();
            $oldPrices = $product->activeVariants
                ?->map(function ($variant) use ($stocksByVariantId, $mainWarehouseId, $supplierWarehouseId, $roughAvailability) {
                    if ($roughAvailability) {
                        $available = max(0, (int) $variant->stock - (int) ($variant->reserved_stock ?? 0));
                        if ($available <= 0 && !(bool) $variant->is_preorder) {
                            return null;
                        }

                        return $variant->old_price !== null && is_numeric((string) $variant->old_price) && (float) $variant->old_price > 0
                            ? (float) $variant->old_price
                            : null;
                    }

                    $variantStocks = $stocksByVariantId->get($variant->id, collect())->keyBy('warehouse_id');
                    $mainStock = $mainWarehouseId > 0 ? $variantStocks->get($mainWarehouseId) : null;
                    $supplierStock = $supplierWarehouseId > 0 ? $variantStocks->get($supplierWarehouseId) : null;
                    $presented = CatalogVariantStockPresenter::forListing($variant, $mainStock, $supplierStock);
                    $price = CatalogVariantStockPresenter::storefrontVariantPrice($variant, $presented);

                    return $price !== null ? $variant->old_price : null;
                })
                ->filter(static fn ($value) => $value !== null && is_numeric((string) $value) && (float) $value > 0)
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
            }

            $mainImagePath = $product->images?->first()?->path;
            $minPrice = $prices->isEmpty() ? null : number_format((float) $prices->min(), 2, '.', '');
            $maxPrice = $prices->isEmpty() ? null : number_format((float) $prices->max(), 2, '.', '');
            $minOldPrice = $oldPrices->isEmpty() ? null : number_format((float) $oldPrices->min(), 2, '.', '');
            $maxOldPrice = $oldPrices->isEmpty() ? null : number_format((float) $oldPrices->max(), 2, '.', '');

            $normalizedDisplay = CatalogSearchScoring::buildProductSearchLabel($brandName, $name);
            $scoreDisplay = $normalizedDisplay !== ''
                ? CatalogSearchScoring::similarityScore($normalizedQuery, $normalizedDisplay)
                : 0.0;

            $scoreName = CatalogSearchScoring::similarityScore($normalizedQuery, $normalizedName);
            $scoreSlug = CatalogSearchScoring::similarityScore($normalizedQuery, $normalizedSlug);
            $scoreBrand = $brandName !== '' ? CatalogSearchScoring::similarityScore($normalizedQuery, $normalizedBrand) : 0.0;
            $scoreVariant = $phaseOneScoring
                ? 0.0
                : $variantTitles->reduce(function (float $carry, $variantTitle) use ($normalizedQuery) {
                    $score = CatalogSearchScoring::similarityScore($normalizedQuery, CatalogSearchScoring::normalizeSearchText((string) $variantTitle));

                    return max($carry, $score);
                }, 0.0);

            $bestScore = max(
                $scoreName,
                $scoreSlug * self::SCORE_WEIGHT_SLUG,
                $scoreBrand * self::SCORE_WEIGHT_BRAND,
                $scoreVariant * self::SCORE_WEIGHT_VARIANT,
                $scoreDisplay * self::SCORE_WEIGHT_DISPLAY,
            );
            $isCodeBoost = isset($codeOrSkuBoostSet[$product->id]);
            if ($isCodeBoost) {
                $bestScore = max($bestScore, 1.0);
            }

            $normalizedDisplay = CatalogSearchScoring::buildProductSearchLabel($brandName, $name);
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
                'is_out_of_stock' => $listingAvailableTotal <= 0 && !$isPreorderAvailable,
                'price_range' => [
                    'min' => $minPrice,
                    'max' => $maxPrice,
                ],
                'old_price_range' => [
                    'min' => $minOldPrice,
                    'max' => $maxOldPrice,
                ],
                'has_discount' => !$prices->isEmpty() && !$oldPrices->isEmpty() && (float) $oldPrices->min() > (float) $prices->min(),
                'has_promotion' => (bool) ($product->variants?->contains(static fn ($variant): bool => (bool) $variant->is_promotion) ?? false),
                'discount_percent' => null,
                'stock_total' => $listingStockTotal,
                'is_preorder_available' => $isPreorderAvailable,
                'variants_count' => (int) ($product->variants?->count() ?? 0),
                'variant_labels' => $variantTitles->values()->all(),
                'matched_code' => $matchedCodeByProductId[(int) $product->id] ?? null,
                '_availability_rank' => $this->smartSearchAvailabilityRank(
                    $product,
                    $listingAvailableTotal,
                    $phaseOneScoring,
                ),
                '_display_label_len' => mb_strlen($normalizedDisplay, 'UTF-8'),
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

    private function smartSearchPhaseOneProductQuery(): Builder
    {
        return Product::query()
            ->where('is_active', true)
            ->with(['brand:id,name']);
    }

    /**
     * @return array<string, mixed>
     */
    private function smartSearchProductRelations(bool $includeImages): array
    {
        $relations = [
            'brand:id,name',
            'variants' => static function ($q): void {
                $q->select('id', 'product_id', 'variant_definition_id', 'price', 'old_price', 'stock', 'reserved_stock', 'is_preorder', 'is_active', 'is_promotion')
                    ->with(['definition:id,title']);
            },
            'activeVariants' => static function ($q): void {
                $q->select('id', 'product_id', 'variant_definition_id', 'price', 'old_price', 'stock', 'reserved_stock', 'is_preorder', 'is_active', 'is_promotion')
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
