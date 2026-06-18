<?php

namespace Modules\Catalog\Services;

use Illuminate\Http\Request;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Support\CatalogApiCacheService;

class CatalogBootstrapService
{
    public function __construct(
        private readonly CatalogProductsListingService $productsListing,
        private readonly CatalogFiltersService $filtersService,
        private readonly CatalogApiCacheService $cacheService,
    ) {}

    /**
     * @return array{
     *     products: array{data: mixed, meta: array<string, int>},
     *     brands: array{data: list<array<string, mixed>>},
     *     filters: array{data: array<string, mixed>},
     *     brand?: array{data: array<string, mixed>}
     * }|null null — бренд по brand_slug не найден
     */
    public function build(Request $request): ?array
    {
        $brandSlug = trim($request->string('brand_slug')->toString());
        $payload = [
            'products' => $this->productsListing->list($request),
            'brands' => [
                'data' => $this->resolveBrandsList(),
            ],
            'filters' => $this->filtersService->build($request),
        ];

        if ($brandSlug === '') {
            return $payload;
        }

        $brandRow = $this->resolveBrandBySlug($brandSlug);
        if ($brandRow === null) {
            return null;
        }

        $payload['brand'] = [
            'data' => $brandRow,
        ];

        return $payload;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function resolveBrandsList(): array
    {
        return $this->cacheService->rememberBrands(static function () {
            return Brand::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'slug'])
                ->toArray();
        });
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
