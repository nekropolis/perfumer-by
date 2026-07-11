<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Support\CatalogApiCacheService;
use Tests\TestCase;

class CatalogApiCacheServiceTest extends TestCase
{
    public function test_deferred_invalidation_coalesces_to_single_bump(): void
    {
        Cache::forget(CatalogApiCacheService::VERSION_KEY);
        Cache::forget(CatalogApiCacheService::SEARCH_VERSION_KEY);

        $service = app(CatalogApiCacheService::class);

        $service->withoutDeferredInvalidation(function () use ($service): void {
            $service->requestInvalidation();
            $service->requestInvalidation();
            $service->requestInvalidation();
        });

        $this->assertSame(2, $service->version());
        $this->assertSame(2, $service->searchVersion());
    }

    public function test_immediate_request_invalidates_version_and_search_version(): void
    {
        Cache::forget(CatalogApiCacheService::VERSION_KEY);
        Cache::forget(CatalogApiCacheService::SEARCH_VERSION_KEY);

        $service = app(CatalogApiCacheService::class);
        $service->requestInvalidation();

        $this->assertSame(2, $service->version());
        $this->assertSame(2, $service->searchVersion());
    }
}
