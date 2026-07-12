<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Modules\Catalog\Services\CatalogFiltersService;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Support\CatalogProductQueryFilters;

class WarmCatalogCacheCommand extends Command
{
    protected $signature = 'catalog:warm-cache {--pages=3 : Сколько страниц пагинации прогреть для базовых sort}';

    protected $description = 'Прогреть кэш bootstrap каталога для популярных query-комбинаций';

    /**
     * @var list<string>
     */
    private const array BASE_SORTS = [
        'popular',
        'price_asc',
        'price_desc',
        'name_asc',
        'name_desc',
    ];

    /**
     * @var list<array<string, string>>
     */
    private const array EXTRA_WARM_QUERIES = [
        ['page' => '1', 'sort' => 'name_asc', 'attr_2' => '2'],
        ['page' => '1', 'sort' => 'popular', 'new' => '1'],
        ['page' => '1', 'sort' => 'popular', 'hit' => '1'],
        ['page' => '1', 'sort' => 'popular', 'sale' => '1'],
    ];

    public function handle(CatalogApiCacheService $cacheService, CatalogFiltersService $filtersService): int
    {
        $defaultFiltersRequest = Request::create('/api/catalog/filters', 'GET');
        $facetParams = CatalogProductQueryFilters::facetCacheQueryParams($defaultFiltersRequest);

        $this->info('Прогрев facet aggregates (default filters)...');
        $facetStartedAt = microtime(true);
        $cacheService->rememberCatalogFilters(
            $facetParams,
            static fn (): array => $filtersService->build($defaultFiltersRequest),
        );
        $this->line(sprintf(
            '  facets default (%s ms)',
            round((microtime(true) - $facetStartedAt) * 1000, 1),
        ));

        $warmQueries = $this->buildWarmQueries();

        $this->info('Прогрев catalog bootstrap cache...');

        foreach ($warmQueries as $queryParams) {
            $request = Request::create('/api/catalog/bootstrap', 'GET', $queryParams);
            $label = http_build_query($queryParams);

            $startedAt = microtime(true);
            $cacheService->rememberBootstrap($queryParams, function () use ($request) {
                return app(\Modules\Catalog\Services\CatalogBootstrapService::class)->buildWithMetrics($request);
            });
            $elapsedMs = round((microtime(true) - $startedAt) * 1000, 1);

            $this->line("  warmed {$label} ({$elapsedMs} ms)");
        }

        $this->info('Готово.');

        return self::SUCCESS;
    }

    /**
     * @return list<array<string, string>>
     */
    private function buildWarmQueries(): array
    {
        $pageCount = max(1, min(10, (int) $this->option('pages')));
        $queries = [];

        foreach (self::BASE_SORTS as $sort) {
            for ($page = 1; $page <= $pageCount; $page++) {
                $queries[] = [
                    'page' => (string) $page,
                    'sort' => $sort,
                ];
            }
        }

        return [...$queries, ...self::EXTRA_WARM_QUERIES];
    }
}
