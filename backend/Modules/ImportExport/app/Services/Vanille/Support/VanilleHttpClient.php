<?php

namespace Modules\ImportExport\Services\Vanille\Support;

class VanilleHttpClient
{
    public function fetchUrl(string $url, int $timeout = 10): string
    {
        $httpResponseHeader = null;
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => $timeout,
                'ignore_errors' => true,
                'header' => implode("\r\n", [
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language: ru-RU,ru;q=0.9,en;q=0.8',
                    'Connection: close',
                ]),
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);

        $html = @file_get_contents($url, false, $context, 0, 5_000_000);

        if ($html === false || $html === '') {
            throw new \RuntimeException($this->formatFetchFailure($url, $httpResponseHeader));
        }

        $status = $this->extractHttpStatus($httpResponseHeader);
        if ($status !== null && ($status < 200 || $status >= 400)) {
            throw new \RuntimeException($this->formatFetchFailure($url, $httpResponseHeader, $status));
        }

        return $html;
    }

    /**
     * @param  array<int, string>|null  $httpResponseHeader
     */
    private function formatFetchFailure(string $url, ?array $httpResponseHeader, ?int $httpStatus = null): string
    {
        $parts = ["Не удалось загрузить URL: {$url}"];

        if ($httpStatus !== null) {
            $parts[] = "HTTP {$httpStatus}";
        } elseif ($httpResponseHeader !== null && $httpResponseHeader !== []) {
            $status = $this->extractHttpStatus($httpResponseHeader);
            if ($status !== null) {
                $parts[] = "HTTP {$status}";
            }
        }

        $phpError = error_get_last();
        if (is_array($phpError) && !empty($phpError['message'])) {
            $parts[] = 'PHP: '.trim((string) $phpError['message']);
        }

        $parts[] = 'проверьте с сервера: curl -I '.escapeshellarg($url);

        return implode('; ', $parts);
    }

    /**
     * @param  array<int, string>|null  $httpResponseHeader
     */
    private function extractHttpStatus(?array $httpResponseHeader): ?int
    {
        if ($httpResponseHeader === null || $httpResponseHeader === []) {
            return null;
        }

        $line = (string) ($httpResponseHeader[0] ?? '');
        if (preg_match('/\s(\d{3})\s/', $line, $matches) === 1) {
            return (int) $matches[1];
        }

        return null;
    }
}
