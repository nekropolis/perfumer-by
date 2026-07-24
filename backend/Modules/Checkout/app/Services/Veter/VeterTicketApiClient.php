<?php

namespace Modules\Checkout\Services\Veter;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class VeterTicketApiClient
{
    /**
     * @param  list<array<string, mixed>>  $tickets
     * @return list<array<string, mixed>>
     */
    public function createTickets(array $tickets): array
    {
        if ($tickets === []) {
            throw new RuntimeException('Veter CreateTickets: empty tickets list.');
        }

        $ticketsJson = json_encode($tickets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($ticketsJson === false) {
            throw new RuntimeException('Veter CreateTickets: failed to encode tickets JSON.');
        }

        $body = $this->postTicketApi('CreateTickets', [
            'tickets' => $ticketsJson,
        ]);

        return $this->parseArrayPayload($body, 'CreateTickets');
    }

    /**
     * @return array{
     *     result: string,
     *     id: string|null,
     *     lastStatus: string|null,
     *     lastStatusDate: string|null,
     *     raw: array<string, mixed>
     * }
     */
    public function getStatus(string $ticketId): array
    {
        $ticketId = trim($ticketId);
        if ($ticketId === '') {
            throw new RuntimeException('Veter getStatus: empty ticketid.');
        }

        $body = $this->postTicketApi('getStatus', [
            'ticketid' => $ticketId,
        ]);

        $rows = $this->parseArrayPayload($body, 'getStatus');
        $row = $rows[0] ?? null;
        if (! is_array($row)) {
            throw new RuntimeException('Veter getStatus: empty result for ticketid='.$ticketId);
        }

        $result = trim((string) ($row['result'] ?? $row['Result'] ?? ''));
        $lastStatus = trim((string) ($row['lastStatus'] ?? $row['LastStatus'] ?? ''));
        $lastStatusDate = trim((string) ($row['lastStatusDate'] ?? $row['LastStatusDate'] ?? ''));
        $id = trim((string) ($row['id'] ?? $row['ID'] ?? ''));

        if ($result !== '' && $result !== '0') {
            $desc = trim((string) ($row['desc'] ?? $row['Desc'] ?? $row['message'] ?? ''), " \t\n\r\0\x0B,");
            throw new RuntimeException(
                $desc !== ''
                    ? 'Veter getStatus result='.$result.': '.$desc
                    : 'Veter getStatus result='.$result.' for ticketid='.$ticketId
            );
        }

        return [
            'result' => $result !== '' ? $result : '0',
            'id' => $id !== '' ? $id : null,
            'lastStatus' => $lastStatus !== '' ? $lastStatus : null,
            'lastStatusDate' => $lastStatusDate !== '' ? $lastStatusDate : null,
            'raw' => $row,
        ];
    }

    /**
     * @param  array<string, string>  $extraHeaders
     */
    private function postTicketApi(string $method, array $extraHeaders): string
    {
        $userId = trim((string) config('services.veter.user_id', ''));
        $apiKey = trim((string) config('services.veter.api_key', ''));
        $baseUrl = rtrim((string) config('services.veter.base_url', ''), '/');

        if ($userId === '' || $apiKey === '' || $baseUrl === '') {
            throw new RuntimeException('Veter API credentials are not configured (VETER_USER_ID / VETER_API_KEY / VETER_BASE_URL).');
        }

        $url = $baseUrl.'/WebServices/PublicAPI/TicketAPI.asmx/'.$method;

        try {
            $response = Http::timeout((int) config('services.veter.timeout', 60))
                ->withHeaders([
                    'content-type' => 'text/json',
                    'userid' => $userId,
                    'apikey' => $apiKey,
                    ...$extraHeaders,
                ])
                ->withBody('{}', 'text/json')
                ->post($url);
        } catch (Throwable $e) {
            throw new RuntimeException("Veter {$method} request failed: ".$e->getMessage(), 0, $e);
        }

        $body = trim($response->body());

        Log::info("Veter {$method} response", [
            'http' => $response->status(),
            'body' => mb_substr($body, 0, 2000),
        ]);

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Veter %s returned HTTP %d: %s',
                $method,
                $response->status(),
                mb_substr($body, 0, 500),
            ));
        }

        return $body;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function parseArrayPayload(string $body, string $method): array
    {
        if ($body === '') {
            throw new RuntimeException("Veter {$method} returned an empty body.");
        }

        $decoded = json_decode($body, true);
        if (is_array($decoded) && array_is_list($decoded)) {
            return $decoded;
        }

        if (is_array($decoded) && ! array_is_list($decoded) && (
            array_key_exists('ID', $decoded)
            || array_key_exists('id', $decoded)
            || array_key_exists('desc', $decoded)
            || array_key_exists('lastStatus', $decoded)
            || array_key_exists('result', $decoded)
        )) {
            return [$decoded];
        }

        if (is_array($decoded) && array_key_exists('d', $decoded)) {
            $inner = $decoded['d'];
            if (is_string($inner)) {
                $inner = json_decode($inner, true);
            }
            if (is_array($inner) && array_is_list($inner)) {
                return $inner;
            }
            if (is_array($inner) && ! array_is_list($inner)) {
                return [$inner];
            }
        }

        if (preg_match('/^\s*(\[[\s\S]*\])/', $body, $matches) === 1) {
            $decoded = json_decode($matches[1], true);
            if (is_array($decoded) && array_is_list($decoded)) {
                return $decoded;
            }
        }

        throw new RuntimeException("Veter {$method} returned unexpected JSON: ".mb_substr($body, 0, 400));
    }
}
