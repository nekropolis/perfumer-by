<?php

namespace Modules\Catalog\Support;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Services\CatalogFiltersService;
use Modules\Catalog\Services\CatalogStorefrontRevalidationService;
use Throwable;

class CatalogApiCacheService
{
    public const VERSION_KEY = 'catalog:api:version';
    public const SEARCH_VERSION_KEY = 'catalog:search:version';
    public const TTL_SECONDS = 900;
    private const SCHEMA_VERSION = 18;

    private int $deferDepth = 0;
    private bool $invalidationPending = false;

    public function rememberProducts(array $queryParams, Closure $resolver): array
    {
        return $this->rememberTracked(
            $this->productsCacheKey($queryParams),
            $resolver,
        )['value'];
    }

    /**
     * @return array{value: array, hit: bool}
     */
    public function rememberProductsTracked(array $queryParams, Closure $resolver): array
    {
        return $this->rememberTracked(
            $this->productsCacheKey($queryParams),
            $resolver,
        );
    }

    public function rememberBrands(Closure $resolver): array
    {
        return $this->rememberTracked(
            sprintf('catalog:api:brands:s%s:v%s', self::SCHEMA_VERSION, $this->version()),
            $resolver,
        )['value'];
    }

    /**
     * @return array{value: array, hit: bool}
     */
    public function rememberBrandsTracked(Closure $resolver): array
    {
        return $this->rememberTracked(
            sprintf('catalog:api:brands:s%s:v%s', self::SCHEMA_VERSION, $this->version()),
            $resolver,
        );
    }

    public function rememberBrandBySlug(string $slug, Closure $resolver): array
    {
        $key = sprintf(
            'catalog:api:brand-by-slug:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(mb_strtolower(trim($slug)))
        );
        /** @var array $result */
        $result = Cache::remember($key, self::TTL_SECONDS, $resolver);
        return $result;
    }

    public function rememberCatalogFilters(array $queryParams, Closure $resolver): array
    {
        return $this->rememberTracked(
            $this->filtersCacheKey($queryParams),
            $resolver,
        )['value'];
    }

    /**
     * @return array{value: array, hit: bool}
     */
    public function rememberCatalogFiltersTracked(array $queryParams, Closure $resolver): array
    {
        return $this->rememberTracked(
            $this->filtersCacheKey($queryParams),
            $resolver,
        );
    }

    /**
     * @return list<array{
     *     id: int,
     *     name: string,
     *     type: string,
     *     sort_order: int,
     *     options: list<array{id: int, name: string, sort_order: int}>
     * }>
     */
    public function rememberFilterableAttributeSchema(Closure $resolver): array
    {
        return $this->rememberTracked(
            sprintf('catalog:api:filter-schema:s%s:v%s', self::SCHEMA_VERSION, $this->version()),
            $resolver,
        )['value'];
    }

    /**
     * @param  array<string, mixed>  $facetParams
     * @return array<int, array<int, int>>
     */
    public function rememberAttributeFacetCounts(array $facetParams, Closure $resolver): array
    {
        return $this->rememberTracked(
            $this->facetPartialCacheKey('attribute-counts', $facetParams),
            $resolver,
        )['value'];
    }

    /**
     * @param  array<string, mixed>  $facetParams
     * @return array{min: float|null, max: float|null}
     */
    public function rememberPriceFacetBounds(array $facetParams, Closure $resolver): array
    {
        return $this->rememberTracked(
            $this->facetPartialCacheKey('price-bounds', $facetParams),
            $resolver,
        )['value'];
    }

    /**
     * @param  array<string, mixed>  $facetParams
     * @return list<array{key: string, label: string, products_count: int}>
     */
    public function rememberVolumeFacetCounts(array $facetParams, Closure $resolver): array
    {
        return $this->rememberTracked(
            $this->facetPartialCacheKey('volume-counts', $facetParams),
            $resolver,
        )['value'];
    }

    public function rememberProductBySlug(string $slug, Closure $resolver): array
    {
        $key = sprintf(
            'catalog:api:product-by-slug:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(mb_strtolower(trim($slug)))
        );
        /** @var array $result */
        $result = Cache::remember($key, self::TTL_SECONDS, $resolver);
        return $result;
    }

    public function rememberBootstrap(array $queryParams, Closure $resolver): ?array
    {
        return $this->rememberBootstrapWithMeta($queryParams, $resolver)['payload'];
    }

    /**
     * @return array{
     *     payload: array|null,
     *     hit: bool,
     *     timings_ms?: array<string, float>,
     *     cache_parts?: array<string, string>
     * }
     */
    public function rememberBootstrapWithMeta(array $queryParams, Closure $resolver): array
    {
        $key = $this->bootstrapCacheKey($queryParams);

        /** @var array|null|false $cached */
        $cached = Cache::get($key);
        if ($cached !== null && $cached !== false) {
            return [
                'payload' => $cached,
                'hit' => true,
            ];
        }

        /** @var array{payload: array|null, timings_ms: array<string, float>, cache_parts: array<string, string>} $built */
        $built = $resolver();
        $payload = $built['payload'] ?? $built;
        $timingsMs = $built['timings_ms'] ?? [];
        $cacheParts = $built['cache_parts'] ?? [];

        if (is_array($built) && array_key_exists('payload', $built)) {
            Cache::put($key, $payload, self::TTL_SECONDS);

            return [
                'payload' => $payload,
                'hit' => false,
                'timings_ms' => $timingsMs,
                'cache_parts' => $cacheParts,
            ];
        }

        Cache::put($key, $payload, self::TTL_SECONDS);

        return [
            'payload' => $payload,
            'hit' => false,
        ];
    }

    public function rememberProductSimilarBySlug(string $slug, int $limit, Closure $resolver): ?array
    {
        $key = sprintf(
            'catalog:api:product-similar:s%s:v%s:%s:%d',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(mb_strtolower(trim($slug))),
            max(4, min(24, $limit)),
        );

        /** @var array|null $result */
        $result = Cache::remember($key, self::TTL_SECONDS, $resolver);
        return $result;
    }

    public function forgetProductSimilarBySlug(string $slug): void
    {
        $hash = md5(mb_strtolower(trim($slug)));
        foreach ([4, 8, 12, 16, 24] as $limit) {
            Cache::forget(sprintf(
                'catalog:api:product-similar:s%s:v%s:%s:%d',
                self::SCHEMA_VERSION,
                $this->version(),
                $hash,
                $limit,
            ));
        }
    }

    public function requestInvalidation(): void
    {
        if ($this->deferDepth > 0) {
            $this->invalidationPending = true;

            return;
        }

        $this->bumpVersion();
    }

    public function beginDeferredInvalidation(): void
    {
        $this->deferDepth++;
    }

    public function commitInvalidation(): void
    {
        if ($this->deferDepth > 0) {
            $this->deferDepth--;
        }

        if ($this->deferDepth !== 0 || !$this->invalidationPending) {
            return;
        }

        $this->invalidationPending = false;
        $this->bumpVersion();
    }

    /**
     * @template T
     * @param  Closure(): T  $callback
     * @return T
     */
    public function withoutDeferredInvalidation(Closure $callback): mixed
    {
        $this->beginDeferredInvalidation();
        try {
            return $callback();
        } finally {
            $this->commitInvalidation();
        }
    }

    public function bumpVersion(): int
    {
        return $this->bumpVersionDetailed()['version'];
    }

    /**
     * @return array{
     *     version: int,
     *     storefront: array{status: 'ok'|'skipped'|'failed', message: string|null}
     * }
     */
    public function bumpVersionDetailed(): array
    {
        $next = $this->version() + 1;
        Cache::forever(self::VERSION_KEY, $next);
        Cache::forever(self::SEARCH_VERSION_KEY, $this->searchVersion() + 1);
        $storefront = $this->triggerStorefrontRevalidation();
        $this->scheduleFacetAggregatesWarmup();

        return [
            'version' => $next,
            'storefront' => $storefront,
        ];
    }

    private function scheduleFacetAggregatesWarmup(): void
    {
        $warm = static function (): void {
            app(CatalogFiltersService::class)->build(Request::create('/api/catalog/filters', 'GET'));
        };

        try {
            if (app()->runningInConsole()) {
                $warm();

                return;
            }

            dispatch($warm)->afterResponse();
        } catch (Throwable) {
        }
    }

    public function version(): int
    {
        return (int) Cache::get(self::VERSION_KEY, 1);
    }

    public function searchVersion(): int
    {
        return (int) Cache::get(self::SEARCH_VERSION_KEY, 1);
    }

    /**
     * @return array{status: 'ok'|'skipped'|'failed', message: string|null}
     */
    private function triggerStorefrontRevalidation(): array
    {
        try {
            return app(CatalogStorefrontRevalidationService::class)->revalidateCatalog();
        } catch (Throwable $e) {
            return [
                'status' => 'failed',
                'message' => $e->getMessage(),
            ];
        }
    }

    private function productsCacheKey(array $queryParams): string
    {
        ksort($queryParams);

        return sprintf(
            'catalog:api:products:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(json_encode($queryParams, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE))
        );
    }

    private function filtersCacheKey(array $queryParams): string
    {
        ksort($queryParams);

        return sprintf(
            'catalog:api:filters:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(json_encode($queryParams, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE))
        );
    }

    private function bootstrapCacheKey(array $queryParams): string
    {
        ksort($queryParams);

        return sprintf(
            'catalog:api:bootstrap:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(json_encode($queryParams, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE))
        );
    }

    /**
     * @param  array<string, mixed>  $facetParams
     */
    private function facetPartialCacheKey(string $suffix, array $facetParams): string
    {
        ksort($facetParams);

        return sprintf(
            'catalog:api:filter-%s:s%s:v%s:%s',
            $suffix,
            self::SCHEMA_VERSION,
            $this->version(),
            md5(json_encode($facetParams, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE))
        );
    }

    /**
     * @template T
     * @param  Closure(): T  $resolver
     * @return array{value: T, hit: bool}
     */
    private function rememberTracked(string $key, Closure $resolver): array
    {
        /** @var mixed $cached */
        $cached = Cache::get($key);
        if ($cached !== null && $cached !== false) {
            /** @var T $cached */
            return [
                'value' => $cached,
                'hit' => true,
            ];
        }

        $value = $resolver();
        Cache::put($key, $value, self::TTL_SECONDS);

        return [
            'value' => $value,
            'hit' => false,
        ];
    }
}
