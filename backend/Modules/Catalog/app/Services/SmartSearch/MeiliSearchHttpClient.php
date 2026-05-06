<?php

namespace Modules\Catalog\Services\SmartSearch;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class MeiliSearchHttpClient
{
    private string $baseUrl;

    private string $apiKey;

    private int $timeoutSeconds;

    public function __construct()
    {
        $this->baseUrl = rtrim((string) config('services.catalog_search.meilisearch.url', ''), '/');
        $this->apiKey = (string) config('services.catalog_search.meilisearch.api_key', '');
        $this->timeoutSeconds = max(1, (int) config('services.catalog_search.meilisearch.timeout_seconds', 2));
    }

    public function enabled(): bool
    {
        return $this->baseUrl !== '';
    }

    /**
     * @return array<string, mixed>
     */
    public function get(string $path): array
    {
        return $this->request('GET', $path);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function post(string $path, array $payload): array
    {
        return $this->request('POST', $path, $payload);
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, ?array $payload = null): array
    {
        if (!$this->enabled()) {
            throw new RuntimeException('Meilisearch is not configured.');
        }

        $url = $this->baseUrl.'/'.ltrim($path, '/');

        try {
            $request = Http::timeout($this->timeoutSeconds)
                ->acceptJson();
            if ($this->apiKey !== '') {
                $request = $request->withToken($this->apiKey);
            }

            $response = $request->send($method, $url, $payload === null ? [] : ['json' => $payload]);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Meilisearch connection failed: '.$e->getMessage(), previous: $e);
        }

        if (!$response->successful()) {
            throw new RuntimeException(sprintf(
                'Meilisearch request failed (%d): %s',
                $response->status(),
                $response->body()
            ));
        }

        $data = $response->json();

        return is_array($data) ? $data : [];
    }
}
