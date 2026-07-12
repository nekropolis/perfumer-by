<?php

namespace Modules\Catalog\Services;

use Illuminate\Http\Request;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogProductQueryFilters;

class CatalogBootstrapService
{
    public function __construct(
        private readonly CatalogProductsListingService $productsListing,
        private readonly CatalogFiltersService $filtersService,
        private readonly CatalogApiCacheService $cacheService,
    ) {}

    /**
     * @return array{payload: array<string, mixed>|null, timings_ms: array<string, float>, cache_parts: array<string, string>}
     */
    public function buildWithMetrics(Request $request): array
    {
        $startedAt = microtime(true);
        $timingsMs = [];
        $cacheParts = [];
        $queryParams = $request->query();
        $facetParams = CatalogProductQueryFilters::facetCacheQueryParams($request);

        $sectionStartedAt = microtime(true);
        $productsTracked = $this->cacheService->rememberProductsTracked(
            $queryParams,
            fn (): array => $this->productsListing->list($request),
        );
        $timingsMs['products'] = (microtime(true) - $sectionStartedAt) * 1000;
        $cacheParts['products'] = $productsTracked['hit'] ? 'HIT' : 'MISS';

        $sectionStartedAt = microtime(true);
        $brandsTracked = $this->cacheService->rememberBrandsTracked(static function () {
            return Brand::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'slug'])
                ->toArray();
        });
        $timingsMs['brands'] = (microtime(true) - $sectionStartedAt) * 1000;
        $cacheParts['brands'] = $brandsTracked['hit'] ? 'HIT' : 'MISS';
        $brands = $brandsTracked['value'];

        $sectionStartedAt = microtime(true);
        $filtersTracked = $this->cacheService->rememberCatalogFiltersTracked(
            $facetParams,
            fn (): array => $this->filtersService->build($request),
        );
        $timingsMs['filters'] = (microtime(true) - $sectionStartedAt) * 1000;
        $cacheParts['filters'] = $filtersTracked['hit'] ? 'HIT' : 'MISS';

        $brandSlug = trim($request->string('brand_slug')->toString());
        $payload = [
            'products' => $productsTracked['value'],
            'brands' => [
                'data' => $brands,
            ],
            'filters' => $filtersTracked['value'],
        ];

        if ($brandSlug !== '') {
            $sectionStartedAt = microtime(true);
            $brandRow = $this->resolveBrandBySlug($brandSlug);
            $timingsMs['brand'] = (microtime(true) - $sectionStartedAt) * 1000;
            $cacheParts['brand'] = 'HIT';

            if ($brandRow === null) {
                $timingsMs['total'] = (microtime(true) - $startedAt) * 1000;

                return [
                    'payload' => null,
                    'timings_ms' => $timingsMs,
                    'cache_parts' => $cacheParts,
                ];
            }

            $payload['brand'] = [
                'data' => $brandRow,
            ];
        }

        $timingsMs['total'] = (microtime(true) - $startedAt) * 1000;

        return [
            'payload' => $payload,
            'timings_ms' => $timingsMs,
            'cache_parts' => $cacheParts,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function build(Request $request): ?array
    {
        return $this->buildWithMetrics($request)['payload'];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function resolveBrandBySlug(string $slug): ?array
    {
        $row = $this->cacheService->rememberBrandBySlug($slug, function () use ($slug): array {
            $brand = Brand::query()
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

            return $brand?->toArray() ?? [];
        });

        if (!isset($row['id'])) {
            return null;
        }

        return $row;
    }
}
