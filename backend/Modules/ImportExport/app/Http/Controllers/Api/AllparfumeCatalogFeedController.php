<?php

namespace Modules\ImportExport\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\ImportExport\Services\Allparfume\AllparfumeCatalogFeedService;
use Modules\ImportExport\Services\Allparfume\AllparfumeIdFileImportService;

class AllparfumeCatalogFeedController extends Controller
{
    public function show(Request $request, AllparfumeCatalogFeedService $feed): JsonResponse
    {
        $this->abortUnlessFeedToken($request);

        return response()->json($feed->build());
    }

    public function importIds(Request $request, AllparfumeIdFileImportService $importService): JsonResponse
    {
        $this->abortUnlessFeedToken($request);

        if ($request->hasFile('file')) {
            $request->validate([
                'file' => ['required', 'file', 'max:10240'],
            ]);
        }

        $data = validator(
            ['items' => $this->resolveItems($request)],
            AllparfumeIdFileImportService::itemValidationRules(),
        )->validate();

        $stats = $importService->import($data['items']);

        return response()->json([
            'message' => sprintf(
                'Импорт ID: обновлено %d, нет slug %d, нет URL Allparfume %d',
                $stats['updated'],
                $stats['unmatched_slug'],
                $stats['unmatched_allparfume_url'],
            ),
            'stats' => $stats,
        ]);
    }

    private function abortUnlessFeedToken(Request $request): void
    {
        $expected = (string) config('services.allparfume.feed_token', '');
        $given = (string) $request->query('token', '');
        if ($expected === '' || $given === '' || ! hash_equals($expected, $given)) {
            abort(404);
        }
    }

    /**
     * @return list<mixed>
     */
    private function resolveItems(Request $request): array
    {
        if ($request->hasFile('file')) {
            $path = $request->file('file')?->getRealPath();
            $raw = is_string($path) && $path !== '' ? (string) file_get_contents($path) : '';
            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                abort(response()->json(['message' => 'Файл должен быть JSON с items'], 422));
            }

            return $this->itemsFromDecoded($decoded);
        }

        $payload = $request->json()->all();
        if ($payload === []) {
            $payload = $request->except(['file', 'token']);
        }

        return $this->itemsFromDecoded($payload);
    }

    /**
     * @param  array<mixed>  $decoded
     * @return list<mixed>
     */
    private function itemsFromDecoded(array $decoded): array
    {
        if ($decoded !== [] && array_is_list($decoded)) {
            return $decoded;
        }

        $items = $decoded['items'] ?? null;

        return is_array($items) ? array_values($items) : [];
    }
}
