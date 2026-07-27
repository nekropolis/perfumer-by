<?php

namespace Modules\ImportExport\Http\Controllers\Admin;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\ImportExport\Jobs\RunAllparfumeSyncJob;
use Modules\ImportExport\Models\AllparfumeProduct;
use Modules\ImportExport\Models\AllparfumeShop;
use Modules\ImportExport\Models\AllparfumeShopOffer;
use Modules\ImportExport\Models\AllparfumeVariant;
use Modules\ImportExport\Services\Allparfume\AllparfumeMatchService;
use Modules\ImportExport\Services\Allparfume\Support\AllparfumeShopRegistry;

class AllparfumeAdminController extends Controller
{
    public function brands(): JsonResponse
    {
        $brands = AllparfumeProduct::query()
            ->selectRaw('brand_slug, MAX(brand_name) as brand_name, COUNT(*) as products_count')
            ->groupBy('brand_slug')
            ->orderBy('brand_slug')
            ->get()
            ->map(static fn ($row) => [
                'brand_slug' => $row->brand_slug,
                'brand_name' => $row->brand_name,
                'products_count' => (int) $row->products_count,
            ])
            ->values();

        return response()->json(['data' => $brands]);
    }

    public function variants(Request $request, AllparfumeMatchService $matchService): JsonResponse
    {
        $baseQuery = AllparfumeVariant::query()
            ->with([
                'allparfumeProduct',
                'shopOffers' => static function ($q): void {
                    $q->orderBy('price')->orderBy('shop_name');
                },
            ])
            ->withCount('shopOffers')
            ->orderByDesc('id');

        if ($request->filled('brand_slug')) {
            $brandSlug = trim($request->string('brand_slug')->toString());
            $baseQuery->whereHas('allparfumeProduct', static function ($q) use ($brandSlug): void {
                $q->where('brand_slug', $brandSlug);
            });
        }

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $tokens = preg_split('/\s+/u', $search, -1, PREG_SPLIT_NO_EMPTY) ?: [$search];
            foreach ($tokens as $token) {
                $baseQuery->where(function ($q) use ($token): void {
                    $q->where('raw_label', 'like', "%{$token}%")
                        ->orWhere('variant_key', 'like', "%{$token}%")
                        ->orWhereHas('allparfumeProduct', static function ($pq) use ($token): void {
                            $pq->where('name', 'like', "%{$token}%")
                                ->orWhere('title', 'like', "%{$token}%")
                                ->orWhere('brand_name', 'like', "%{$token}%")
                                ->orWhere('external_slug', 'like', "%{$token}%");
                        });
                });
            }
        }

        $status = trim($request->string('status')->toString());
        $query = clone $baseQuery;

        if ($status === 'confirmed') {
            $query->whereNotNull('product_variant_link_id');
        } elseif ($status === 'found_unconfirmed') {
            $query->whereNull('product_variant_link_id')
                ->where(function ($q): void {
                    $q->whereNotNull('match_payload->suggested_variant_id')
                        ->orWhereNotNull('match_payload->suggested_product_id');
                });
        } elseif ($status === 'unlinked') {
            $query->whereNull('product_variant_link_id')
                ->where(function ($q): void {
                    $q->whereNull('match_payload->suggested_variant_id')
                        ->whereNull('match_payload->suggested_product_id');
                });
        }

        $perPage = (int) $request->integer('per_page', 50);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 50;
        }

        $items = $query->paginate($perPage);

        $listStatsBase = clone $baseQuery;
        $stats = [
            'confirmed' => (clone $listStatsBase)->whereNotNull('product_variant_link_id')->count(),
            'found_unconfirmed' => (clone $listStatsBase)
                ->whereNull('product_variant_link_id')
                ->where(function ($q): void {
                    $q->whereNotNull('match_payload->suggested_variant_id')
                        ->orWhereNotNull('match_payload->suggested_product_id');
                })
                ->count(),
            'unlinked' => (clone $listStatsBase)
                ->whereNull('product_variant_link_id')
                ->where(function ($q): void {
                    $q->whereNull('match_payload->suggested_variant_id')
                        ->whereNull('match_payload->suggested_product_id');
                })
                ->count(),
        ];

        $variantIds = [];
        $productIds = [];
        foreach ($items->items() as $item) {
            if (! $item instanceof AllparfumeVariant) {
                continue;
            }
            $payload = is_array($item->match_payload) ? $item->match_payload : [];
            if ($item->product_variant_link_id) {
                $variantIds[] = (int) $item->product_variant_link_id;
            }
            if (! empty($payload['suggested_variant_id'])) {
                $variantIds[] = (int) $payload['suggested_variant_id'];
            }
            if (! empty($payload['linked_variant_id'])) {
                $variantIds[] = (int) $payload['linked_variant_id'];
            }
            if (! empty($payload['suggested_product_id'])) {
                $productIds[] = (int) $payload['suggested_product_id'];
            }
        }

        $variantIds = array_values(array_unique(array_filter($variantIds)));
        $productIds = array_values(array_unique(array_filter($productIds)));

        $links = ProductVariantLink::query()
            ->whereIn('id', $variantIds)
            ->with(['product.brand'])
            ->get()
            ->keyBy('id');
        $products = Product::query()
            ->whereIn('id', $productIds)
            ->with(['brand', 'variants'])
            ->get()
            ->keyBy('id');

        $data = collect($items->items())->map(
            fn ($item) => $matchService->serializeVariant(
                $item,
                $links,
                $products,
            )
        )->values();

        return response()->json([
            'data' => $data,
            'current_page' => $items->currentPage(),
            'last_page' => $items->lastPage(),
            'total' => $items->total(),
            'stats' => $stats,
        ]);
    }

    public function shops(Request $request, AllparfumeShopRegistry $shopRegistry): JsonResponse
    {
        // Populate registry from already stored offers (table may be empty after migrate/import).
        $shopRegistry->syncFromExistingOffers();

        $query = AllparfumeShop::query()->orderBy('shop_name')->orderBy('shop_key');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($q) use ($search): void {
                $q->where('shop_name', 'like', "%{$search}%")
                    ->orWhere('shop_key', 'like', "%{$search}%");
            });
        }

        if ($request->has('is_active') && $request->input('is_active') !== '' && $request->input('is_active') !== null) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $perPage = (int) $request->integer('per_page', 50);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 50;
        }

        $items = $query->paginate($perPage);

        $shopKeys = collect($items->items())
            ->map(static fn ($shop) => $shop instanceof AllparfumeShop ? (string) $shop->shop_key : null)
            ->filter()
            ->values()
            ->all();

        $countsByKey = [];
        if ($shopKeys !== []) {
            $countsByKey = AllparfumeShopOffer::query()
                ->selectRaw('shop_key, COUNT(*) as offers_count')
                ->whereIn('shop_key', $shopKeys)
                ->groupBy('shop_key')
                ->pluck('offers_count', 'shop_key')
                ->all();
        }

        $data = collect($items->items())->map(static function ($shop) use ($countsByKey) {
            if (! $shop instanceof AllparfumeShop) {
                return null;
            }
            $key = (string) $shop->shop_key;

            return [
                'id' => (int) $shop->id,
                'shop_key' => $key,
                'shop_name' => (string) $shop->shop_name,
                'shop_url' => $shop->shop_url,
                'is_active' => (bool) $shop->is_active,
                'offers_count' => (int) ($countsByKey[$key] ?? $shop->offers_count ?? 0),
            ];
        })->filter()->values();

        return response()->json([
            'data' => $data,
            'current_page' => $items->currentPage(),
            'last_page' => $items->lastPage(),
            'total' => $items->total(),
        ]);
    }

    public function updateShop(Request $request, int $id, AllparfumeShopRegistry $shopRegistry): JsonResponse
    {
        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $shop = AllparfumeShop::query()->findOrFail($id);
        $shop = $shopRegistry->setActive($shop, (bool) $data['is_active']);
        $shopRegistry->refreshOffersCount($shop);

        return response()->json([
            'message' => $shop->is_active ? 'Магазин включён' : 'Магазин выключен',
            'data' => [
                'id' => (int) $shop->id,
                'shop_key' => (string) $shop->shop_key,
                'shop_name' => (string) $shop->shop_name,
                'is_active' => (bool) $shop->is_active,
                'offers_count' => (int) $shop->offers_count,
            ],
        ]);
    }

    public function startRefresh(): JsonResponse
    {
        return $this->startSyncJob(RunAllparfumeSyncJob::MODE_REFRESH, 'Обновление цен Allparfume поставлено в очередь');
    }

    public function startFullSync(): JsonResponse
    {
        return $this->startSyncJob(RunAllparfumeSyncJob::MODE_FULL, 'Парсинг Allparfume поставлен в очередь');
    }

    public function syncStatus(string $jobId): JsonResponse
    {
        return response()->json([
            'data' => Cache::get(RunAllparfumeSyncJob::cacheKey($jobId)),
        ]);
    }

    public function syncActive(): JsonResponse
    {
        $jobId = Cache::get(RunAllparfumeSyncJob::activeKey());
        if (! $jobId) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => Cache::get(RunAllparfumeSyncJob::cacheKey((string) $jobId)),
        ]);
    }

    public function autoMatch(Request $request, AllparfumeMatchService $matchService): JsonResponse
    {
        $data = $request->validate([
            'brand_slug' => ['nullable', 'string', 'max:191'],
            'only_unlinked' => ['nullable', 'boolean'],
        ]);

        $stats = $matchService->autoMatch(
            $data['brand_slug'] ?? null,
            array_key_exists('only_unlinked', $data) ? (bool) $data['only_unlinked'] : true,
        );

        return response()->json([
            'message' => sprintf(
                'Автоматчинг: обработано %d, связано %d, кандидаты %d, без матча %d',
                $stats['processed'],
                $stats['linked'],
                $stats['suggested'],
                $stats['skipped'],
            ),
            'stats' => $stats,
        ]);
    }

    public function forceLink(Request $request, AllparfumeMatchService $matchService): JsonResponse
    {
        $data = $request->validate([
            'allparfume_variant_id' => ['required', 'integer', 'min:1'],
            'variant_id' => ['required', 'integer', 'min:1'],
        ]);

        $matchService->forceLink((int) $data['allparfume_variant_id'], (int) $data['variant_id']);

        return response()->json(['message' => 'Связка сохранена']);
    }

    public function resetLink(Request $request, AllparfumeMatchService $matchService): JsonResponse
    {
        $data = $request->validate([
            'allparfume_variant_id' => ['required', 'integer', 'min:1'],
        ]);

        $matchService->resetLink((int) $data['allparfume_variant_id']);

        return response()->json(['message' => 'Связка сброшена']);
    }

    private function startSyncJob(string $mode, string $message): JsonResponse
    {
        if (Cache::get(RunAllparfumeSyncJob::activeKey())) {
            return response()->json([
                'message' => 'Синхронизация Allparfume уже выполняется',
            ], 409);
        }

        $jobId = (string) Str::uuid();
        Cache::put(RunAllparfumeSyncJob::activeKey(), $jobId, now()->addHours(24));
        Cache::put(RunAllparfumeSyncJob::cacheKey($jobId), [
            'job_id' => $jobId,
            'job_type' => $mode,
            'status' => 'queued',
            'message' => 'Задача поставлена в очередь',
            'progress' => 0,
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));

        RunAllparfumeSyncJob::dispatch($jobId, $mode);

        return response()->json([
            'message' => $message,
            'job_id' => $jobId,
        ], 202);
    }
}
