<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use GuzzleHttp\Cookie\CookieJar;
use GuzzleHttp\Cookie\SetCookie;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class VanilleHttpClient
{
    // DDOS-Guard на vanille.by отдаёт 403 на Chrome/WebKit UA без полного браузерного fingerprint.
    private const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';

    public function createCookieJar(): CookieJar
    {
        return new CookieJar();
    }

    public function fetchUrl(string $url, int $timeout = 10): string
    {
        $jar = $this->createCookieJar();

        return $this->fetchUrlWithCookieJar($url, $jar, $timeout)['body'];
    }

    /**
     * @return array{body: string, cookie_jar: CookieJar}
     */
    public function fetchUrlWithCookieJar(string $url, CookieJar $jar, int $timeout = 10): array
    {
        $response = Http::withOptions([
            'cookies' => $jar,
            'verify' => false,
            'timeout' => $timeout,
            'allow_redirects' => true,
        ])
            ->withHeaders($this->defaultRequestHeaders())
            ->get($url);

        if (!$response->successful()) {
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
     * @return array{body: string, cookie_header: string}
     */
    public function fetchUrlWithCookies(string $url, int $timeout = 10): array
    {
        $jar = $this->createCookieJar();
        $result = $this->fetchUrlWithCookieJar($url, $jar, $timeout);

        return [
            'body' => $result['body'],
            'cookie_header' => $this->cookieJarToHeader($jar),
        ];
    }

    public function postForm(
        string $url,
        array $fields,
        int $timeout = 15,
        string $cookieHeader = '',
        string $referer = 'https://vanille.by/',
    ): string {
        $jar = $this->createCookieJar();
        if ($cookieHeader !== '') {
            $this->applyCookieHeaderToJar($jar, $cookieHeader);
        }

        return $this->postFormWithCookieJar($url, $fields, $jar, $referer, $timeout);
    }

    public function postFormWithCookieJar(
        string $url,
        array $fields,
        CookieJar $jar,
        string $referer = 'https://vanille.by/',
        int $timeout = 15,
    ): string {
        $response = Http::withOptions([
            'cookies' => $jar,
            'verify' => false,
            'timeout' => $timeout,
            'allow_redirects' => true,
        ])
            ->withHeaders([
                ...$this->defaultRequestHeaders(),
                'Content-Type' => 'application/x-www-form-urlencoded',
                'X-Requested-With' => 'XMLHttpRequest',
                'Referer' => $referer,
                'Origin' => 'https://vanille.by',
            ])
            ->asForm()
            ->post($url, $fields);

        if (!$response->successful()) {
            throw new RuntimeException($this->formatHttpFailure('POST', $url, $response->status(), $response->body()));
        }

        return $response->body();
    }

    /**
     * @return list<string>
     */
    private function defaultRequestHeaders(): array
    {
        return [
            'User-Agent' => self::DEFAULT_USER_AGENT,
            'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language' => 'ru-RU,ru;q=0.9,en;q=0.8',
        ];
    }

    private function cookieJarToHeader(CookieJar $jar): string
    {
        $chunks = [];
        foreach ($jar->toArray() as $cookie) {
            $name = trim((string) ($cookie['Name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $chunks[] = $name . '=' . (string) ($cookie['Value'] ?? '');
        }

        return implode('; ', $chunks);
    }

    private function applyCookieHeaderToJar(CookieJar $jar, string $cookieHeader): void
    {
        foreach (explode(';', $cookieHeader) as $part) {
            $part = trim($part);
            if ($part === '' || !str_contains($part, '=')) {
                continue;
            }
            [$name, $value] = explode('=', $part, 2);
            $jar->setCookie(new SetCookie([
                'Name' => trim($name),
                'Value' => trim($value),
                'Domain' => 'vanille.by',
            ]));
        }
    }

    private function formatHttpFailure(string $method, string $url, int $status, string $body): string
    {
        $snippet = trim(mb_substr(preg_replace('/\s+/u', ' ', strip_tags($body)) ?? '', 0, 200));

        return trim("{$method} {$url} failed: HTTP {$status}" . ($snippet !== '' ? " — {$snippet}" : ''));
    }
}
