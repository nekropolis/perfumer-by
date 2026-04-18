<?php

namespace Modules\ImportExport\Services\Vanille\Support;

class VanilleHttpClient
{
    public function fetchUrl(string $url, int $timeout = 10): string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => $timeout,
                'header' => implode("\r\n", [
                    'User-Agent: Mozilla/5.0 (compatible; VanilleParser/1.0)',
                    'Accept: text/html,application/xhtml+xml',
                    'Connection: close',
                ]),
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);

        $html = @file_get_contents($url, false, $context);

        if ($html === false) {
            throw new \RuntimeException("Не удалось загрузить URL: {$url}");
        }

        return $html;
    }
}
