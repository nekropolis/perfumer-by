<?php

namespace Modules\Catalog\Support;

use Closure;
use Illuminate\Support\Facades\Cache;

class CatalogApiCacheService
{
    public const VERSION_KEY = 'catalog:api:version';
    public const TTL_SECONDS = 900;
    private const SCHEMA_VERSION = 12;

    public function rememberProducts(array $queryParams, Closure $resolver): array
    {
        ksort($queryParams);
        $key = sprintf(
            'catalog:api:products:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(json_encode($queryParams, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE))
        );

        /** @var array $result */
        $result = Cache::remember($key, self::TTL_SECONDS, $resolver);
        return $result;
    }

    public function rememberBrands(Closure $resolver): array
    {
        $key = sprintf('catalog:api:brands:s%s:v%s', self::SCHEMA_VERSION, $this->version());
        /** @var array $result */
        $result = Cache::remember($key, self::TTL_SECONDS, $resolver);
        return $result;
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
        ksort($queryParams);
        $key = sprintf(
            'catalog:api:filters:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(json_encode($queryParams, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE))
        );
        /** @var array $result */
        $result = Cache::remember($key, self::TTL_SECONDS, $resolver);
        return $result;
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
        ksort($queryParams);
        $key = sprintf(
            'catalog:api:bootstrap:s%s:v%s:%s',
            self::SCHEMA_VERSION,
            $this->version(),
            md5(json_encode($queryParams, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE))
        );

        /** @var array|null $result */
        $result = Cache::remember($key, self::TTL_SECONDS, $resolver);
        return $result;
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

    public function bumpVersion(): int
    {
        $next = $this->version() + 1;
        Cache::forever(self::VERSION_KEY, $next);
        return $next;
    }

    public function version(): int
    {
        return (int) Cache::get(self::VERSION_KEY, 1);
    }
}

