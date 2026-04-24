<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Http;

/**
 * Поиск населённых пунктов РБ через Nominatim (OSM). Укажите контакт в User-Agent в продакшене.
 */
class CheckoutCitiesController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['data' => []]);
        }

        try {
            $response = Http::timeout(8)
                ->withHeaders([
                    'User-Agent' => config('app.name', 'perfumer-by') . '/1.0 (checkout cities; +https://openstreetmap.org/copyright)',
                    'Accept-Language' => 'ru,be,en',
                ])
                ->get('https://nominatim.openstreetmap.org/search', [
                    'format' => 'json',
                    'addressdetails' => 1,
                    'countrycodes' => 'by',
                    'limit' => 10,
                    'q' => $q,
                ]);
        } catch (\Throwable) {
            return response()->json(['data' => [], 'message' => 'Сервис поиска городов временно недоступен'], 503);
        }

        if (!$response->successful()) {
            return response()->json(['data' => [], 'message' => 'Ошибка поиска'], 502);
        }

        /** @var list<array<string, mixed>> $rows */
        $rows = $response->json() ?: [];
        $out = [];

        foreach ($rows as $row) {
            $lat = isset($row['lat']) ? (string) $row['lat'] : '';
            $lon = isset($row['lon']) ? (string) $row['lon'] : '';
            $display = (string) ($row['display_name'] ?? '');
            if ($display === '') {
                continue;
            }

            $normalized = mb_strtolower($display);
            if (str_contains($normalized, 'минск') || str_contains($normalized, 'minsk') || str_contains($normalized, 'мінск')) {
                continue;
            }

            $id = md5($lat . '|' . $lon . '|' . $display);
            $out[] = [
                'id' => $id,
                'name' => $display,
                'lat' => $lat !== '' ? (float) $lat : null,
                'lon' => $lon !== '' ? (float) $lon : null,
            ];
        }

        return response()->json(['data' => $out]);
    }
}
