<?php

namespace Modules\Catalog\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

final class CatalogStorefrontRevalidationService
{
    /**
     * @var list<string>
     */
    public const array CATALOG_TAGS = [
        'catalog',
        'catalog-products',
        'catalog-brands',
        'catalog-brand-detail',
        'catalog-filters',
        'catalog-product-detail',
        'catalog-bootstrap',
        'catalog-search',
    ];

    /**
     * @return array{status: 'ok'|'skipped'|'failed', message: string|null}
     */
    public function revalidateCatalog(): array
    {
        $url = trim((string) config('services.catalog_storefront.revalidate_url', ''));
        $secret = trim((string) config('services.catalog_storefront.revalidate_secret', ''));

        if ($url === '' || $secret === '') {
            return [
                'status' => 'skipped',
                'message' => 'CATALOG_STOREFRONT_REVALIDATE_URL/SECRET не настроены',
            ];
        }

        try {
            Http::timeout(5)
                ->withHeaders(['X-Revalidate-Secret' => $secret])
                ->post($url, [
                    'tags' => self::CATALOG_TAGS,
                ])
                ->throw();

            return [
                'status' => 'ok',
                'message' => null,
            ];
        } catch (\Throwable $e) {
            Log::warning('catalog_storefront.revalidate_failed', [
                'message' => $e->getMessage(),
            ]);

            return [
                'status' => 'failed',
                'message' => $e->getMessage(),
            ];
        }
    }
}
