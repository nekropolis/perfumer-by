<?php

namespace Modules\ImportExport\Services\Allparfume\Support;

use GuzzleHttp\Cookie\CookieJar;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class AllparfumeHttpClient
{
    private const BASE_URL = 'https://allparfume.by';

    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';

    public function createCookieJar(): CookieJar
    {
        return new CookieJar();
    }

    public function fetchUrl(string $url, int $timeout = 20): string
    {
        return $this->fetchUrlWithCookieJar($url, $this->createCookieJar(), $timeout)['body'];
    }

    /**
     * @return array{body: string, cookie_jar: CookieJar}
     */
    public function fetchUrlWithCookieJar(string $url, CookieJar $jar, int $timeout = 20): array
    {
        $response = $this->buildHttp($timeout)
            ->withOptions([
                'cookies' => $jar,
                'allow_redirects' => true,
            ])
            ->withHeaders($this->defaultHeaders())
            ->get($url);

        if (! $response->successful()) {
            throw new RuntimeException($this->formatHttpFailure('GET', $url, $response->status(), $response->body()));
        }

        $body = $response->body();
        if ($body === '') {
            throw new RuntimeException("Пустой ответ GET: {$url}");
        }

        return [
            'body' => $body,
            'cookie_jar' => $jar,
        ];
    }

    /**
     * @param  array<string, scalar|null>  $fields
     */
    public function postFormWithCookieJar(
        string $url,
        array $fields,
        CookieJar $jar,
        string $referer,
        int $timeout = 20,
    ): string {
        $response = $this->buildHttp($timeout)
            ->withOptions([
                'cookies' => $jar,
                'allow_redirects' => true,
            ])
            ->withHeaders([
                ...$this->defaultHeaders(),
                'Content-Type' => 'application/x-www-form-urlencoded',
                'X-Requested-With' => 'XMLHttpRequest',
                'Origin' => self::BASE_URL,
                'Referer' => $referer,
                'Accept' => '*/*',
            ])
            ->asForm()
            ->post($url, $fields);

        if (! $response->successful()) {
            throw new RuntimeException($this->formatHttpFailure('POST', $url, $response->status(), $response->body()));
        }

        return $response->body();
    }

    public function fetchVariantShopOffersHtml(
        string $parfumeId,
        string $cardClick,
        string $referer,
        CookieJar $jar,
        int $timeout = 20,
    ): string {
        return $this->postFormWithCookieJar(
            self::BASE_URL.'/scripts/prices.php',
            [
                'parfume-id' => $parfumeId,
                'card-click' => $cardClick,
                'ids_1' => '',
            ],
            $jar,
            $referer,
            $timeout,
        );
    }

    public function normalizeUrl(string $pathOrUrl): string
    {
        $value = trim($pathOrUrl);
        if ($value === '') {
            return self::BASE_URL;
        }

        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            return $value;
        }

        if (str_starts_with($value, '/')) {
            return self::BASE_URL.$value;
        }

        return self::BASE_URL.'/'.ltrim($value, './');
    }

    private function buildHttp(int $timeout): \Illuminate\Http\Client\PendingRequest
    {
        return Http::withOptions([
            'verify' => false,
            'timeout' => $timeout,
            'connect_timeout' => $timeout,
        ])->retry(2, 1000);
    }

    /**
     * @return array<string, string>
     */
    private function defaultHeaders(): array
    {
        return [
            'User-Agent' => self::USER_AGENT,
            'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language' => 'ru-RU,ru;q=0.9,en;q=0.8',
        ];
    }

    private function formatHttpFailure(string $method, string $url, int $status, string $body): string
    {
        $snippet = trim(mb_substr(preg_replace('/\s+/u', ' ', strip_tags($body)) ?? '', 0, 200));

        return trim("{$method} {$url} failed: HTTP {$status}".($snippet !== '' ? " — {$snippet}" : ''));
    }
}
