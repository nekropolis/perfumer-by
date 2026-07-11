<?php

namespace Modules\Catalog\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

final class CatalogStorefrontRevalidationService
{
    public function revalidateCatalog(): void
    {
        $url = trim((string) config('services.catalog_storefront.revalidate_url', ''));
        $secret = trim((string) config('services.catalog_storefront.revalidate_secret', ''));

        if ($url === '' || $secret === '') {
            return;
        }

        try {
            Http::timeout(5)
                ->withHeaders(['X-Revalidate-Secret' => $secret])
                ->post($url, [
                    'tags' => [
                        'catalog',
                        'catalog-products',
                        'catalog-brands',
                        'catalog-brand-detail',
                        'catalog-filters',
                        'catalog-product-detail',
                        'catalog-bootstrap',
                        'catalog-search',
                    ],
                ])
                ->throw();
        } catch (\Throwable $e) {
            Log::warning('catalog_storefront.revalidate_failed', [
                'message' => $e->getMessage(),
            ]);
        }
    }
}
