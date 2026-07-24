<?php

namespace Modules\Checkout\Services\Veter;

use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class VeterCityApiClient
{
    private const DAY_KEYS = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
    ];

    /**
     * @return list<array{id: int, name: string}>
     */
    public function fetchTracks(): array
    {
        return array_values(array_filter(array_map(
            function (array $row): ?array {
                $id = (int) ($row['id'] ?? 0);
                $name = trim((string) ($row['name'] ?? ''));
                if ($id <= 0 || $name === '') {
                    return null;
                }

                return ['id' => $id, 'name' => $name];
            },
            $this->postJsonArray('GetAllTracksWithIdJSON'),
        )));
    }

    /**
     * @return list<array{id: int, name: string, monday: int, tuesday: int, wednesday: int, thursday: int, friday: int, saturday: int, sunday: int}>
     */
    public function fetchDistricts(): array
    {
        return array_values(array_filter(array_map(
            function (array $row): ?array {
                $id = (int) ($row['id'] ?? 0);
                $name = trim((string) ($row['name'] ?? ''));
                if ($id <= 0 || $name === '') {
                    return null;
                }

                $days = [];
                foreach (self::DAY_KEYS as $key) {
                    $days[$key] = ((string) ($row[$key] ?? '0')) === '1' ? 1 : 0;
                }

                return [
                    'id' => $id,
                    'name' => $name,
                    ...$days,
                ];
            },
            $this->postJsonArray('GetAllDistricsWithIdJSON'),
        )));
    }

    /**
     * @return list<array{id: int, name: string, region_id: int|null, district_id: int|null, village_council_name: string|null}>
     */
    public function fetchCities(): array
    {
        return array_values(array_filter(array_map(
            function (array $row): ?array {
                $id = (int) ($row['id'] ?? 0);
                $name = trim((string) ($row['name'] ?? ''));
                if ($id <= 0 || $name === '') {
                    return null;
                }

                $regionId = (int) ($row['region_id'] ?? 0);
                $districtId = (int) ($row['district_id'] ?? 0);
                $village = trim((string) ($row['village_council_name'] ?? ''));

                return [
                    'id' => $id,
                    'name' => $name,
                    'region_id' => $regionId > 0 ? $regionId : null,
                    'district_id' => $districtId > 0 ? $districtId : null,
                    'village_council_name' => $village !== '' ? $village : null,
                ];
            },
            $this->postJsonArray('GetAllCityWithIdJSON'),
        )));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function postJsonArray(string $method): array
    {
        $userId = trim((string) config('services.veter.user_id', ''));
        $apiKey = trim((string) config('services.veter.api_key', ''));
        $baseUrl = rtrim((string) config('services.veter.base_url', ''), '/');

        if ($userId === '' || $apiKey === '' || $baseUrl === '') {
            throw new RuntimeException('Veter API credentials are not configured (VETER_USER_ID / VETER_API_KEY / VETER_BASE_URL).');
        }

        $url = $baseUrl.'/WebServices/PublicAPI/CityAPI.asmx/'.$method;

        try {
            $response = Http::timeout((int) config('services.veter.timeout', 60))
                ->withHeaders([
                    'content-type' => 'application/json',
                    'userid' => $userId,
                    'apikey' => $apiKey,
                ])
                ->withBody('{}', 'application/json')
                ->post($url);
        } catch (Throwable $e) {
            throw new RuntimeException('Veter API request failed: '.$e->getMessage(), 0, $e);
        }

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Veter API %s returned HTTP %d: %s',
                $method,
                $response->status(),
                mb_substr($response->body(), 0, 300),
            ));
        }

        return $this->parseArrayPayload($response->body(), $method);
    }

    /**
     * ASMX иногда отдаёт `[{...}]{"d":null}` — берём только JSON-массив.
     *
     * @return list<array<string, mixed>>
     */
    private function parseArrayPayload(string $body, string $method): array
    {
        $body = trim($body);
        if ($body === '') {
            throw new RuntimeException("Veter API {$method} returned an empty body.");
        }

        $decoded = json_decode($body, true);
        if (is_array($decoded) && array_is_list($decoded)) {
            return $decoded;
        }

        if (preg_match('/^\s*(\[[\s\S]*\])/', $body, $matches) === 1) {
            $decoded = json_decode($matches[1], true);
            if (is_array($decoded) && array_is_list($decoded)) {
                return $decoded;
            }
        }

        throw new RuntimeException("Veter API {$method} returned unexpected JSON.");
    }
}
