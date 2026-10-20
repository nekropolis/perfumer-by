<?php

namespace Modules\ImportExport\Support\ElParfume;

use Illuminate\Http\Client\Response;

final class ElParfumeRedirectVerifier
{
    public const RESULT_OK = 'ok';

    public const RESULT_WRONG_TARGET = 'wrong_target';

    public const RESULT_NOT_301 = 'not_301';

    public const RESULT_MULTI_HOP = 'multi_hop';

    public const RESULT_TARGET_NOT_200 = 'target_not_200';

    public const RESULT_ERROR = 'error';

    /**
     * @return array{
     *     status: int|null,
     *     location: string,
     *     target_status: int|null,
     *     result: string,
     *     error: string,
     *     expected_location: string,
     * }
     */
    public function evaluate(
        ?Response $sourceResponse,
        ?Response $targetResponse,
        string $expectedLocation,
        string $sourceError = '',
    ): array {
        $expectedLocation = $this->normalizeComparableUrl($expectedLocation);

        if ($sourceError !== '') {
            return $this->row(null, '', null, self::RESULT_ERROR, $sourceError, $expectedLocation);
        }

        if ($sourceResponse === null) {
            return $this->row(null, '', null, self::RESULT_ERROR, 'No response from old URL', $expectedLocation);
        }

        $status = $sourceResponse->status();
        $location = trim((string) $sourceResponse->header('Location'));

        if ($status !== 301) {
            return $this->row($status, $location, null, self::RESULT_NOT_301, '', $expectedLocation);
        }

        if ($location === '') {
            return $this->row($status, '', null, self::RESULT_WRONG_TARGET, 'Missing Location header', $expectedLocation);
        }

        $absoluteLocation = $this->normalizeComparableUrl($location);
        if ($absoluteLocation !== $expectedLocation) {
            return $this->row($status, $location, null, self::RESULT_WRONG_TARGET, '', $expectedLocation);
        }

        if ($targetResponse === null) {
            return $this->row($status, $location, null, self::RESULT_ERROR, 'No response from target URL', $expectedLocation);
        }

        $targetStatus = $targetResponse->status();
        if ($this->isRedirectStatus($targetStatus)) {
            $chain = $this->redirectChainSummary($location, $targetResponse);

            return $this->row(
                $status,
                $location,
                $targetStatus,
                self::RESULT_MULTI_HOP,
                $chain,
                $expectedLocation,
            );
        }

        if ($targetStatus !== 200) {
            return $this->row($status, $location, $targetStatus, self::RESULT_TARGET_NOT_200, '', $expectedLocation);
        }

        return $this->row($status, $location, $targetStatus, self::RESULT_OK, '', $expectedLocation);
    }

    public function buildExpectedLocation(string $newHost, string $target): string
    {
        $target = trim($target);
        if ($target === '') {
            return rtrim($newHost, '/');
        }
        if (! str_starts_with($target, '/')) {
            $target = '/'.$target;
        }

        return $this->normalizeComparableUrl(rtrim($newHost, '/').$target);
    }

    public function joinOldUrl(string $oldHost, string $oldPath): string
    {
        $oldPath = trim($oldPath);
        if ($oldPath === '') {
            return rtrim($oldHost, '/').'/';
        }
        if (str_starts_with($oldPath, 'http://') || str_starts_with($oldPath, 'https://')) {
            return $oldPath;
        }
        if (! str_starts_with($oldPath, '/')) {
            $oldPath = '/'.$oldPath;
        }

        return rtrim($oldHost, '/').$oldPath;
    }

    /**
     * @return list<string>
     */
    public function variantUrls(string $oldHost, string $oldPath): array
    {
        $base = $this->joinOldUrl($oldHost, $oldPath);
        $variants = [];

        $withoutSlash = $this->withoutTrailingSlash($base);
        if ($withoutSlash !== $base) {
            $variants[] = $withoutSlash;
        }

        $withSlash = $this->withTrailingSlash($base);
        if ($withSlash !== $base && ! in_array($withSlash, $variants, true)) {
            $variants[] = $withSlash;
        }

        $variants[] = $this->appendQuery($base, 'utm_source=x');

        $http = $this->swapScheme($base, 'http');
        if ($http !== $base) {
            $variants[] = $http;
        }

        $www = $this->withWwwHost($base);
        if ($www !== $base) {
            $variants[] = $www;
        }

        return array_values(array_unique($variants));
    }

    public function normalizeComparableUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }

        $parts = parse_url($url);
        if (! is_array($parts)) {
            return $url;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? 'https'));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $port = isset($parts['port']) ? (int) $parts['port'] : null;
        $path = (string) ($parts['path'] ?? '');
        if ($path === '') {
            $path = '/';
        }

        $query = isset($parts['query']) && $parts['query'] !== '' ? '?'.$parts['query'] : '';

        $authority = $host;
        if ($port !== null && ! $this->isDefaultPort($scheme, $port)) {
            $authority .= ':'.$port;
        }

        return $scheme.'://'.$authority.$path.$query;
    }

    private function row(
        ?int $status,
        string $location,
        ?int $targetStatus,
        string $result,
        string $error,
        string $expectedLocation,
    ): array {
        return [
            'status' => $status,
            'location' => $location,
            'target_status' => $targetStatus,
            'result' => $result,
            'error' => $error,
            'expected_location' => $expectedLocation,
        ];
    }

    private function isRedirectStatus(int $status): bool
    {
        return in_array($status, [301, 302, 303, 307, 308], true);
    }

    private function redirectChainSummary(string $firstLocation, Response $secondResponse): string
    {
        $chain = [$firstLocation];
        $next = trim((string) $secondResponse->header('Location'));
        if ($next !== '') {
            $chain[] = $next;
        }

        return implode(' -> ', array_slice($chain, 0, 3));
    }

    private function withoutTrailingSlash(string $url): string
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return $url;
        }
        $path = (string) ($parts['path'] ?? '/');
        if ($path === '/' || ! str_ends_with($path, '/')) {
            return $url;
        }
        $parts['path'] = rtrim($path, '/');

        return $this->buildUrl($parts);
    }

    private function withTrailingSlash(string $url): string
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return $url;
        }
        $path = (string) ($parts['path'] ?? '/');
        if ($path === '/' || str_ends_with($path, '/')) {
            return $url;
        }
        $parts['path'] = $path.'/';

        return $this->buildUrl($parts);
    }

    private function appendQuery(string $url, string $query): string
    {
        $separator = str_contains($url, '?') ? '&' : '?';

        return $url.$separator.$query;
    }

    private function swapScheme(string $url, string $scheme): string
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return $url;
        }
        $parts['scheme'] = $scheme;

        return $this->buildUrl($parts);
    }

    private function withWwwHost(string $url): string
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ! isset($parts['host'])) {
            return $url;
        }
        $host = (string) $parts['host'];
        if (str_starts_with($host, 'www.')) {
            return $url;
        }
        $parts['host'] = 'www.'.$host;

        return $this->buildUrl($parts);
    }

    /**
     * @param  array<string, mixed>  $parts
     */
    private function buildUrl(array $parts): string
    {
        $scheme = (string) ($parts['scheme'] ?? 'https');
        $host = (string) ($parts['host'] ?? '');
        $port = isset($parts['port']) ? ':'.$parts['port'] : '';
        $path = (string) ($parts['path'] ?? '/');
        $query = isset($parts['query']) && $parts['query'] !== '' ? '?'.$parts['query'] : '';

        return $scheme.'://'.$host.$port.$path.$query;
    }

    private function isDefaultPort(string $scheme, int $port): bool
    {
        return ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443);
    }
}
