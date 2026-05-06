<?php

namespace Modules\Catalog\Services\SmartSearch;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class ProductSearchRetrievalService
{
    public function __construct(
        private readonly MeiliSearchHttpClient $client,
        private readonly ProductSearchIndexer $indexer
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->client->enabled() && (bool) config('services.catalog_search.enabled', false);
    }

    /**
     * @return array{ids:list<int>, suggested_query:?string, source:string, elapsed_ms:int}
     */
    public function searchProductIds(string $query, int $limit): array
    {
        if (!$this->isEnabled()) {
            return [
                'ids' => [],
                'suggested_query' => null,
                'source' => 'disabled',
                'elapsed_ms' => 0,
            ];
        }

        $start = microtime(true);
        $cacheTtl = max(5, (int) config('services.catalog_search.search_cache_ttl_seconds', 20));
        $cacheKey = sprintf('catalog:smart-search:ids:%s:%d', md5(mb_strtolower(trim($query), 'UTF-8')), $limit);

        try {
            $payload = Cache::remember($cacheKey, $cacheTtl, function () use ($query, $limit): array {
                $this->indexer->ensureIndexConfigured();
                return $this->client->post('/indexes/'.$this->indexer->indexName().'/search', [
                    'q' => $query,
                    'limit' => max(1, min($limit, 200)),
                    'attributesToRetrieve' => ['id', 'name', 'display_title'],
                    'filter' => 'is_active = true',
                ]);
            });

            $ids = collect($payload['hits'] ?? [])
                ->pluck('id')
                ->filter(static fn ($id): bool => is_numeric($id))
                ->map(static fn ($id): int => (int) $id)
                ->unique()
                ->values()
                ->all();

            $suggested = $this->guessSuggestion((string) $query, $payload);

            return [
                'ids' => $ids,
                'suggested_query' => $suggested,
                'source' => 'meilisearch',
                'elapsed_ms' => (int) round((microtime(true) - $start) * 1000),
            ];
        } catch (RuntimeException $e) {
            Log::warning('Smart search meilisearch fallback', [
                'query' => $query,
                'error' => $e->getMessage(),
            ]);

            return [
                'ids' => [],
                'suggested_query' => null,
                'source' => 'fallback',
                'elapsed_ms' => (int) round((microtime(true) - $start) * 1000),
            ];
        }
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function guessSuggestion(string $query, array $payload): ?string
    {
        $trimmedQuery = trim($query);
        if ($trimmedQuery === '') {
            return null;
        }

        $topHit = collect($payload['hits'] ?? [])->first();
        if (!is_array($topHit)) {
            return null;
        }

        $candidate = trim((string) ($topHit['display_title'] ?? $topHit['name'] ?? ''));
        if ($candidate === '') {
            return null;
        }

        $queryNormalized = mb_strtolower($trimmedQuery, 'UTF-8');
        $candidateNormalized = mb_strtolower($candidate, 'UTF-8');

        if ($candidateNormalized === $queryNormalized) {
            return null;
        }

        if (str_contains($candidateNormalized, $queryNormalized)) {
            return null;
        }

        return $candidate;
    }
}
