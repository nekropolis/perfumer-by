<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Modules\Catalog\Jobs\RunSellerOneParseJob;
use Modules\Catalog\Jobs\RunSellerOneRefreshLinkedPricesJob;
use Modules\ImportExport\Services\Vanille\VanilleImportService;
use Modules\ImportExport\Services\Vanille\VanilleMediaImportService;
use Modules\Catalog\Models\VanilleImportJob;
use Modules\Catalog\Models\VanilleImportJobLog;
use Modules\Catalog\Models\SupplierProduct;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Rules\ValidUploadedSpreadsheet;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Throwable;


class VanilleImportController extends Controller
{
    private function getOrCreateSellerOneSupplier(): Supplier
    {
        return Supplier::query()->firstOrCreate(
            ['code' => 'supplier-price-xls'],
            [
                'name' => 'Supplier XLS Price',
                'is_active' => true,
            ]
        );
    }

    public function parseBrands(VanilleImportService $service)
    {
        try {
            $job = $service->enqueueJob(VanilleImportService::JOB_TYPE_PARSE_BRANDS);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'Задача парсинга брендов добавлена в очередь',
            'job' => $job,
        ], 202);
    }

    public function collectLinks(Request $request, VanilleImportService $service)
    {
        try {
            $job = $service->enqueueJob(VanilleImportService::JOB_TYPE_COLLECT_LINKS);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'Задача сбора ссылок добавлена в очередь',
            'job' => $job,
        ], 202);
    }

    public function parseProducts(Request $request, VanilleImportService $service)
    {
        try {
            $job = $service->enqueueJob(VanilleImportService::JOB_TYPE_PARSE_PRODUCTS);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'Задача парсинга карточек добавлена в очередь',
            'job' => $job,
        ], 202);
    }

    /**
     * Синхронно спарсить одну карточку по URL (или slug) и записать в отдельный JSON в imports/vanille/products/.
     */
    public function parseSingleProductUrl(Request $request, VanilleImportService $service): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'string', 'max:2048'],
        ]);

        try {
            $result = $service->parseSingleProductUrlToJsonFile($validated['url']);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if (!($result['success'] ?? false)) {
            return response()->json([
                'message' => $result['message'] ?? 'Не удалось спарсить страницу',
                'data' => $result,
            ], 422);
        }

        $importResult = $service->importFromJsonFile((string) ($result['file_path'] ?? ''), true);
        $touched = (int) ($importResult['imported'] ?? 0) + (int) ($importResult['updated'] ?? 0);
        $importOk = (bool) ($importResult['success'] ?? false) && $touched > 0;
        $payload = array_merge($result, ['import' => $importResult]);

        $importedProduct = collect($importResult['created_products'] ?? [])
            ->merge($importResult['updated_products'] ?? [])
            ->first();

        $message = $importOk
            ? 'Карточка сохранена и импортирована в каталог.'
            : (($importResult['message'] ?? '') !== ''
                ? (string) $importResult['message']
                : 'Карточка сохранена, но импорт в каталог завершился с ошибками.');

        if ($importOk && is_array($importedProduct)) {
            $slug = trim((string) ($importedProduct['slug'] ?? ''));
            $productId = (int) ($importedProduct['product_id'] ?? 0);
            if ($slug !== '') {
                $message .= ' Slug: '.$slug.'.';
            }
            if ($productId > 0) {
                $message .= ' ID: '.$productId.'.';
            }
        }

        return response()->json([
            'message' => $message,
            'data' => $payload,
        ]);
    }

    /**
     * Каталожное фото / описание только для товара по введённому URL (без массовой очереди).
     */
    public function singleUrlMediaFollowUp(
        Request $request,
        VanilleImportService $importService,
        VanilleMediaImportService $mediaService
    ): \Illuminate\Http\JsonResponse {
        $validated = $request->validate([
            'url' => ['required_without:product_id', 'nullable', 'string', 'max:2048'],
            'product_id' => ['required_without:url', 'nullable', 'integer', 'min:1'],
            'catalog' => ['sometimes', 'boolean'],
            'descriptions' => ['sometimes', 'boolean'],
        ]);

        $catalog = (bool) ($validated['catalog'] ?? false);
        $descriptions = (bool) ($validated['descriptions'] ?? false);

        if ($catalog === false && $descriptions === false) {
            return response()->json(['message' => 'Отметьте хотя бы один шаг.'], 422);
        }

        $productId = null;
        $productIdInput = (int) ($validated['product_id'] ?? 0);
        if ($productIdInput > 0) {
            $productId = $importService->resolveLinkedVanilleProductIdByProductId($productIdInput);
        }
        if ($productId === null) {
            $url = trim((string) ($validated['url'] ?? ''));
            if ($url === '') {
                return response()->json(['message' => 'Укажите URL или product_id.'], 422);
            }
            $productId = $importService->resolveLinkedVanilleProductId($url);
        }
        if ($productId === null) {
            return response()->json([
                'message' => 'Не найден связанный товар Vanille по этому URL. Сначала импортируйте карточку.',
            ], 422);
        }

        $result = $mediaService->runSingleProductMediaFollowUp($productId, $catalog, $descriptions);

        return response()->json([
            'message' => $result['message'],
            'data' => [
                'product_id' => $productId,
                'success' => $result['success'],
                'steps' => $result['steps'],
            ],
        ], $result['success'] ? 200 : 422);
    }

    public function pipelineNewProducts(VanilleImportService $service)
    {
        try {
            $job = $service->enqueuePipelineNewProducts();
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        $this->writeVanilleAudit($job->id, AuditLogService::ACTION_CREATED, 'Парсинг нового товара: задача поставлена в очередь');

        return response()->json([
            'message' => 'Запущен полный цикл парсинга только новых карточек Vanille',
            'job' => $job,
        ], 202);
    }

    public function pipelineRefreshAll(VanilleImportService $service)
    {
        try {
            $job = $service->enqueuePipelineRefreshAll();
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        $this->writeVanilleAudit(
            $job->id,
            AuditLogService::ACTION_CREATED,
            'Спарсить все товары заново (без изменения цены/наличия/описаний/SEO): задача поставлена в очередь'
        );

        return response()->json([
            'message' => 'Запущен полный репарс всех карточек Vanille (без изменения цены/наличия/описаний/SEO у существующих товаров)',
            'job' => $job,
        ], 202);
    }

    public function vanilleParseStatus(VanilleImportService $service)
    {
        $job = $service->getActiveImportJob();

        return response()->json([
            'data' => $job,
        ]);
    }

    public function listImportJobs(Request $request)
    {
        $perPage = min(50, max(5, (int) $request->query('per_page', 15)));

        $jobs = VanilleImportJob::query()
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json($jobs);
    }

    public function listImportJobLogs(Request $request, int $id)
    {
        VanilleImportJob::query()->findOrFail($id);

        $perPage = min(200, max(10, (int) $request->query('per_page', 50)));

        $logs = VanilleImportJobLog::query()
            ->where('vanille_import_job_id', $id)
            ->orderBy('id')
            ->paginate($perPage);

        return response()->json($logs);
    }

    public function supplierProducts(Request $request)
    {
        $supplier = Supplier::query()->where('code', 'vanille')->first();
        if (!$supplier) {
            return response()->json([
                'data' => [],
                'current_page' => 1,
                'last_page' => 1,
                'total' => 0,
            ]);
        }

        $query = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->with(['supplier', 'brand', 'product'])
            ->orderByDesc('last_seen_at')
            ->orderByDesc('id');

        if ($request->filled('linked')) {
            $linked = filter_var($request->string('linked')->toString(), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($linked !== null) {
                $query->where('is_linked', $linked);
            }
        }

        if ($request->filled('active')) {
            $active = filter_var($request->string('active')->toString(), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($active !== null) {
                $query->where('is_active', $active);
            }
        }

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());

            $query->where(function ($q) use ($search) {
                $q->where('external_name', 'like', "%{$search}%")
                    ->orWhere('external_slug', 'like', "%{$search}%")
                    ->orWhere('external_url', 'like', "%{$search}%");
            });
        }

        $items = $query->paginate(50);

        return response()->json($items);
    }

    public function importParsedProducts(VanilleImportService $service)
    {
        try {
            $job = $service->enqueueImportParsedProducts();
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        $this->writeVanilleAudit($job->id, AuditLogService::ACTION_CREATED, 'Импортировать спарсенные товары: задача поставлена в очередь');

        return response()->json([
            'message' => 'Задача импорта спарсенных товаров добавлена в очередь',
            'job' => $job,
        ], 202);
    }

    public function parseCatalogImages(VanilleImportService $service)
    {
        try {
            $job = $service->enqueueParseCatalogImages();
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'Импорт каталожных изображений поставлен в очередь',
            'job' => $job,
        ], 202);
    }

    public function rewriteDescriptions(VanilleImportService $service)
    {
        try {
            $job = $service->enqueueRewriteDescriptions();
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'Уникализация описаний поставлена в очередь',
            'job' => $job,
        ], 202);
    }

    public function previewSupplierPrice(Request $request, SupplierPriceImportService $service)
    {
        $validated = $request->validate([
            'file' => ['required', new ValidUploadedSpreadsheet(), 'mimes:xls,xlsx'],
            'offset' => ['nullable', 'integer', 'min:0'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);

        $result = $service->preview(
            $validated['file'],
            (int) ($validated['offset'] ?? 0),
            (int) ($validated['limit'] ?? 100)
        );

        return response()->json($result);
    }

    public function startSellerOneParse(Request $request): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', new ValidUploadedSpreadsheet(), 'mimes:xls,xlsx'],
        ]);

        if (Cache::get(RunSellerOneRefreshLinkedPricesJob::activeKey())) {
            return response()->json([
                'message' => 'Сначала дождитесь окончания обновления цен Seller One',
            ], 409);
        }

        $parseActiveId = Cache::get(RunSellerOneParseJob::activeKey());
        if (is_string($parseActiveId) && $parseActiveId !== '') {
            $activeStatus = Cache::get(RunSellerOneParseJob::cacheKey($parseActiveId));
            $activeStatusName = is_array($activeStatus) ? ($activeStatus['status'] ?? null) : null;
            if (in_array($activeStatusName, ['queued', 'running'], true)) {
                return response()->json([
                    'message' => 'Парсинг Seller One уже выполняется',
                    'job_id' => $parseActiveId,
                ], 409);
            }
        }

        $jobId = (string) Str::uuid();
        // Явно кладём на `local` диск: RunSellerOneParseJob читает именно его.
        // Без второго аргумента Storage берёт FILESYSTEM_DISK, который на проде
        // может быть `public` — тогда воркер не найдёт файл.
        $storedPath = $validated['file']->store('seller-one-temp', 'local');

        Cache::put(
            RunSellerOneParseJob::cacheKey($jobId),
            [
                'job_id' => $jobId,
                'status' => 'queued',
                'processed' => 0,
                'total_rows' => 0,
                'matched' => 0,
                'inserted' => 0,
                'updated' => 0,
                'skipped_linked' => 0,
                'message' => 'Задача поставлена в очередь',
                'updated_at' => now()->toDateTimeString(),
            ],
            now()->addHours(24)
        );

        // Общий ключ активного джоба — читает discovery-эндпоинт
        // (`sellerOneActiveStatus`), чтобы виджет в шапке знал про запущенный
        // парсинг, не завися от localStorage конкретного браузера.
        // Джоб сам очистит ключ при завершении/ошибке.
        Cache::put(RunSellerOneParseJob::activeKey(), $jobId, now()->addHours(24));

        RunSellerOneParseJob::dispatch($jobId, $storedPath);

        return response()->json([
            'message' => 'Парсинг запущен в фоне',
            'job_id' => $jobId,
        ], 202);
    }

    public function sellerOneParseStatus(string $jobId): \Illuminate\Http\JsonResponse
    {
        $status = Cache::get(RunSellerOneParseJob::cacheKey($jobId));

        if (!$status) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => $status,
        ]);
    }

    public function cancelSellerOneParse(Request $request): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'job_id' => ['nullable', 'string', 'max:64'],
        ]);

        $jobId = trim((string) ($validated['job_id'] ?? ''));
        if ($jobId === '') {
            $activeId = Cache::get(RunSellerOneParseJob::activeKey());
            $jobId = is_string($activeId) ? trim($activeId) : '';
        }

        if ($jobId === '') {
            return response()->json([
                'message' => 'Нет активного парсинга Seller One',
            ], 404);
        }

        $cacheKey = RunSellerOneParseJob::cacheKey($jobId);
        $status = Cache::get($cacheKey);
        if (! is_array($status)) {
            RunSellerOneParseJob::clearActiveJobIfMatches($jobId);
            Cache::forget('seller_one_parse_running:'.$jobId);

            return response()->json([
                'message' => 'Задача парсинга не найдена',
            ], 404);
        }

        $statusName = (string) ($status['status'] ?? '');
        if (! in_array($statusName, ['queued', 'running'], true)) {
            return response()->json([
                'message' => 'Парсинг уже не выполняется',
                'job_id' => $jobId,
                'data' => $status,
            ]);
        }

        RunSellerOneParseJob::requestCancellation($jobId, 'Парсинг остановлен пользователем');
        app(SupplierPriceImportService::class)->clearSellerOneParseArtifacts($jobId);

        $updated = Cache::get($cacheKey);

        return response()->json([
            'message' => 'Остановка парсинга запрошена',
            'job_id' => $jobId,
            'data' => is_array($updated) ? $updated : null,
        ]);
    }

    /**
     * Discovery-эндпоинт для виджета активных задач в шапке:
     * возвращает текущий активный Seller One job без необходимости знать его id
     * на клиенте. Используется, когда вкладка не знает job_id (другая сессия,
     * другая вкладка, очищенный localStorage).
     *
     * Контракт: `{ data: null }` — нет активных; `{ data: {...} }` — статус джоба.
     * В 404 здесь не уходим намеренно: клиенту удобнее всегда получать 200.
     */
    public function sellerOneActiveStatus(): \Illuminate\Http\JsonResponse
    {
        $parseActiveId = Cache::get(RunSellerOneParseJob::activeKey());
        if (is_string($parseActiveId) && $parseActiveId !== '') {
            $status = Cache::get(RunSellerOneParseJob::cacheKey($parseActiveId));
            if (!$status) {
                Cache::forget(RunSellerOneParseJob::activeKey());
            } else {
                $statusName = is_array($status) ? ($status['status'] ?? null) : null;
                if (in_array($statusName, ['completed', 'failed', 'cancelled'], true)) {
                    Cache::forget(RunSellerOneParseJob::activeKey());
                } else {
                    return response()->json(['data' => $status]);
                }
            }
        }

        $refreshActiveId = Cache::get(RunSellerOneRefreshLinkedPricesJob::activeKey());
        if (!is_string($refreshActiveId) || $refreshActiveId === '') {
            return response()->json(['data' => null]);
        }

        $refreshStatus = Cache::get(RunSellerOneRefreshLinkedPricesJob::cacheKey($refreshActiveId));
        if (!$refreshStatus) {
            Cache::forget(RunSellerOneRefreshLinkedPricesJob::activeKey());

            return response()->json(['data' => null]);
        }

        $refreshName = is_array($refreshStatus) ? ($refreshStatus['status'] ?? null) : null;
        if ($refreshName === 'completed' || $refreshName === 'failed') {
            Cache::forget(RunSellerOneRefreshLinkedPricesJob::activeKey());

            return response()->json(['data' => null]);
        }

        return response()->json(['data' => $refreshStatus]);
    }

    public function applySupplierPrice(Request $request, SupplierPriceImportService $service)
    {
        $validated = $request->validate([
            'rows' => ['required', 'array'],
            'rows.*.code' => ['required', 'string'],
            'rows.*.title' => ['required', 'string'],
            'rows.*.selected_variant_id' => ['nullable', 'integer'],
            'rows.*.supplier_price' => ['nullable'],
        ]);

        $result = $service->apply($validated['rows']);

        return response()->json($result);
    }

    public function startSellerOneRefreshLinkedPrices(Request $request): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', new ValidUploadedSpreadsheet(), 'mimes:xls,xlsx'],
        ]);

        if (Cache::get(RunSellerOneParseJob::activeKey())) {
            return response()->json([
                'message' => 'Сначала дождитесь окончания парсинга Seller One',
            ], 409);
        }

        $jobId = (string) Str::uuid();
        $storedPath = $validated['file']->store('seller-one-refresh-linked-temp', 'local');
        $originalName = $validated['file']->getClientOriginalName();

        Cache::put(
            RunSellerOneRefreshLinkedPricesJob::cacheKey($jobId),
            [
                'job_id' => $jobId,
                'job_type' => 'refresh_linked',
                'status' => 'queued',
                'processed' => 0,
                'total_linked' => 0,
                'updated' => 0,
                'skipped' => 0,
                'price_history_rows' => 0,
                'message' => 'Задача обновления цен поставлена в очередь',
                'updated_at' => now()->toDateTimeString(),
            ],
            now()->addHours(24)
        );

        Cache::put(RunSellerOneRefreshLinkedPricesJob::activeKey(), $jobId, now()->addHours(24));

        RunSellerOneRefreshLinkedPricesJob::dispatch($jobId, $storedPath, $originalName);

        return response()->json([
            'message' => 'Обновление цен связанных товаров поставлено в очередь',
            'job_id' => $jobId,
        ], 202);
    }

    public function sellerOneRefreshLinkedStatus(string $jobId): \Illuminate\Http\JsonResponse
    {
        $status = Cache::get(RunSellerOneRefreshLinkedPricesJob::cacheKey($jobId));

        if (!$status) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => $status,
        ]);
    }

    public function sellerOneSupplierProducts(Request $request, SupplierPriceImportService $service)
    {
        $supplier = Supplier::query()->where('code', 'supplier-price-xls')->first();
        if (!$supplier) {
            return response()->json([
                'data' => [],
                'current_page' => 1,
                'last_page' => 1,
                'total' => 0,
                'stats' => [
                    'confirmed' => 0,
                    'found_unconfirmed' => 0,
                    'new' => 0,
                    'unlinked' => 0,
                    'parsing_inactive' => 0,
                    ...$service->getLastPriceApplyMeta(),
                ],
            ]);
        }

        $baseQuery = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->with(['brand', 'product.brand'])
            ->orderByDesc('last_seen_at')
            ->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $baseQuery->where(function ($q) use ($search) {
                $q->where('external_name', 'like', "%{$search}%")
                    ->orWhere('external_slug', 'like', "%{$search}%")
                    ->orWhere('external_url', 'like', "%{$search}%");
            });
        }

        $status = trim($request->string('status')->toString());
        $stockFilter = trim($request->string('stock')->toString());

        $query = clone $baseQuery;
        if ($status === 'parsing_inactive') {
            $query->where('link_parsing_active', false);
        } else {
            $query->where('link_parsing_active', true)
                ->where(function ($q) {
                    $q->where('is_linked', true)
                        ->orWhereNull('payload->absent_from_parse_table_at');
                });
        }

        if ($status === 'confirmed') {
            $query->where('is_linked', true);
        } elseif ($status === 'found_unconfirmed') {
            $query->where('is_linked', false)
                ->where(function ($q) {
                    $q->whereNotNull('payload->suggested_variant_id')
                        ->orWhereNotNull('payload->suggested_product_id');
                })
                ->where(function ($q) {
                    $q->whereNull('payload->match_confidence')
                        ->orWhere('payload->match_confidence', '<', 100);
                });
        } elseif ($status === 'new') {
            $query->where('is_linked', false)->where('payload->is_new', true);
        } elseif ($status === 'unlinked') {
            $query->where('is_linked', false)->where(function ($q) {
                $q->whereNull('payload->suggested_variant_id')
                    ->whereNull('payload->suggested_product_id');
            });
        }

        if ($stockFilter === 'in_stock') {
            $query->where('payload->price_file_in_stock', true);
        } elseif ($stockFilter === 'out_of_stock') {
            $query->where(function ($q) {
                $q->where('payload->price_file_in_stock', false)
                    ->orWhereNull('payload->price_file_in_stock');
            });
        }

        $items = $query->paginate(50);

        $listStatsBase = clone $baseQuery;
        $listStatsBase->where('link_parsing_active', true)
            ->where(function ($q) {
                $q->where('is_linked', true)
                    ->orWhereNull('payload->absent_from_parse_table_at');
            });

        $stats = [
            'confirmed' => (clone $listStatsBase)
                ->where('is_linked', true)
                ->count(),
            'found_unconfirmed' => (clone $listStatsBase)
                ->where('is_linked', false)
                ->where(function ($q) {
                    $q->whereNotNull('payload->suggested_variant_id')
                        ->orWhereNotNull('payload->suggested_product_id');
                })
                ->where(function ($q) {
                    $q->whereNull('payload->match_confidence')
                        ->orWhere('payload->match_confidence', '<', 100);
                })
                ->count(),
            'new' => (clone $listStatsBase)
                ->where('is_linked', false)
                ->where('payload->is_new', true)
                ->count(),
            'unlinked' => (clone $listStatsBase)
                ->where('is_linked', false)
                ->where(function ($q) {
                    $q->whereNull('payload->suggested_variant_id')
                        ->whereNull('payload->suggested_product_id');
                })
                ->count(),
            'parsing_inactive' => (clone $baseQuery)
                ->where('link_parsing_active', false)
                ->count(),
            ...$service->getLastPriceApplyMeta(),
        ];

        $externalCodes = collect($items->items())
            ->map(fn (SupplierProduct $item) => $item->payload['external_code'] ?? null)
            ->filter()
            ->values()
            ->all();

        $offers = SupplierVariantOffer::query()
            ->where('supplier_id', $supplier->id)
            ->whereIn('external_id', $externalCodes)
            ->with(['productVariant.product.brand'])
            ->get()
            ->keyBy('external_id');

        $suggestedVariantIds = collect($items->items())
            ->map(fn (SupplierProduct $item) => $item->payload['suggested_variant_id'] ?? null)
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $linkedVariantIds = collect($items->items())
            ->map(fn (SupplierProduct $item) => $item->payload['linked_variant_id'] ?? null)
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $suggestedProductIds = collect($items->items())
            ->map(fn (SupplierProduct $item) => $item->payload['suggested_product_id'] ?? null)
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $suggestedVariants = ProductVariant::query()
            ->whereIn('id', $suggestedVariantIds)
            ->with(['product.brand'])
            ->get()
            ->keyBy('id');

        $linkedVariants = ProductVariant::query()
            ->whereIn('id', $linkedVariantIds)
            ->with(['product.brand'])
            ->get()
            ->keyBy('id');

        // Продукты-кандидаты без варианта: нужны, чтобы показать «Создать вариант» в UI.
        // Eager-loadим variants, чтобы отдать их количество — UI решает, что предлагать.
        $suggestedProducts = Product::query()
            ->whereIn('id', $suggestedProductIds)
            ->with(['brand', 'variants'])
            ->get()
            ->keyBy('id');

        $items->getCollection()->transform(function (SupplierProduct $item) use ($offers, $suggestedVariants, $linkedVariants, $suggestedProducts) {
            $payload = is_array($item->payload) ? $item->payload : [];
            $externalCode = (string) ($payload['external_code'] ?? '');
            $offer = $externalCode ? $offers->get($externalCode) : null;
            $suggestedVariant = isset($payload['suggested_variant_id'])
                ? $suggestedVariants->get((int) $payload['suggested_variant_id'])
                : null;
            $suggestedProduct = isset($payload['suggested_product_id'])
                ? $suggestedProducts->get((int) $payload['suggested_product_id'])
                : null;
            $linkedVariantFromPayload = isset($payload['linked_variant_id'])
                ? $linkedVariants->get((int) $payload['linked_variant_id'])
                : null;
            $linkedVariant = $offer?->productVariant ?? $linkedVariantFromPayload;
            $catalogSupplierAvailable = $linkedVariant
                ? CatalogVariantStockPresenter::supplierListingActive($linkedVariant)
                : null;

            return [
                'id' => $item->id,
                'external_name' => $item->external_name,
                'external_slug' => $item->external_slug,
                'external_url' => $item->external_url,
                'is_linked' => (bool) $item->is_linked,
                'is_active' => (bool) $item->is_active,
                'link_parsing_active' => (bool) $item->link_parsing_active,
                'last_seen_at' => optional($item->last_seen_at)?->toDateTimeString(),
                'code' => $externalCode,
                'supplier_price' => $payload['supplier_price'] ?? ($payload['min_price'] ?? null),
                'price_file_in_stock' => array_key_exists('price_file_in_stock', $payload)
                    ? $payload['price_file_in_stock']
                    : null,
                'catalog_supplier_channel_available' => $catalogSupplierAvailable,
                'parsed' => $payload['parsed'] ?? null,
                'is_new' => (bool) ($payload['is_new'] ?? false),
                'match_confidence' => (int) ($payload['match_confidence'] ?? 0),
                'match_confidence_breakdown' => $payload['match_confidence_breakdown'] ?? null,
                'status' => $item->is_linked
                    ? 'confirmed'
                    : ((int) ($payload['match_confidence'] ?? 0) >= 1
                        && (!empty($payload['suggested_variant_id']) || !empty($payload['suggested_product_id']))
                        ? 'found_unconfirmed'
                        : ((bool) ($payload['is_new'] ?? false) ? 'new' : 'unlinked')),
                'brand' => $item->brand ? [
                    'id' => $item->brand->id,
                    'name' => $item->brand->name,
                ] : null,
                'product' => $item->product ? [
                    'id' => $item->product->id,
                    'name' => $item->product->name,
                    'display_name' => ProductDisplayName::forProduct($item->product),
                    'slug' => $item->product->slug,
                ] : null,
                'suggested_variant' => $suggestedVariant ? [
                    'id' => $suggestedVariant->id,
                    'product_id' => $suggestedVariant->product_id,
                    'product_name' => $suggestedVariant->product?->name,
                    'display_name' => $suggestedVariant->product
                        ? ProductDisplayName::forProduct($suggestedVariant->product)
                        : null,
                    'brand_name' => $suggestedVariant->product?->brand?->name,
                    'display' => trim(implode(' / ', array_filter([
                        $suggestedVariant->volume ? "{$suggestedVariant->volume} {$suggestedVariant->volume_unit}" : null,
                        $suggestedVariant->concentration ? strtoupper((string) $suggestedVariant->concentration) : null,
                        $suggestedVariant->edition,
                    ]))),
                ] : null,
                'suggested_product' => $suggestedProduct ? [
                    'id' => $suggestedProduct->id,
                    'name' => $suggestedProduct->name,
                    'display_name' => ProductDisplayName::forProduct($suggestedProduct),
                    'slug' => $suggestedProduct->slug,
                    'brand_name' => $suggestedProduct->brand?->name,
                    'variants_count' => is_countable($suggestedProduct->variants)
                        ? count($suggestedProduct->variants)
                        : 0,
                ] : null,
                'linked_variant' => $linkedVariant ? [
                    'id' => $linkedVariant->id,
                    'product_id' => $linkedVariant->product_id,
                    'product_name' => $linkedVariant->product?->name,
                    'display_name' => $linkedVariant->product
                        ? ProductDisplayName::forProduct($linkedVariant->product)
                        : null,
                    'brand_name' => $linkedVariant->product?->brand?->name,
                    'display' => trim(implode(' / ', array_filter([
                        $linkedVariant->volume ? "{$linkedVariant->volume} {$linkedVariant->volume_unit}" : null,
                        $linkedVariant->concentration ? strtoupper((string) $linkedVariant->concentration) : null,
                        $linkedVariant->edition,
                    ]))),
                ] : null,
            ];
        });

        return response()->json([
            'data' => $items->items(),
            'current_page' => $items->currentPage(),
            'last_page' => $items->lastPage(),
            'total' => $items->total(),
            'stats' => $stats,
        ]);
    }

    public function forceLinkSellerOneProduct(Request $request, SupplierPriceImportService $service)
    {
        $validated = $request->validate([
            'supplier_product_id' => ['required', 'integer', 'exists:supplier_products,id'],
            'variant_id' => ['required', 'integer', 'exists:product_variant_links,id'],
        ]);

        $result = $service->forceLink(
            (int) $validated['supplier_product_id'],
            (int) $validated['variant_id']
        );

        return response()->json($result);
    }

    public function resetSellerOneProductLink(Request $request, SupplierPriceImportService $service)
    {
        $validated = $request->validate([
            'supplier_product_id' => ['required', 'integer', 'exists:supplier_products,id'],
        ]);

        $result = $service->resetLink((int) $validated['supplier_product_id']);

        return response()->json($result);
    }

    public function updateSellerOneSupplierProductParsingActive(Request $request)
    {
        $supplier = $this->getOrCreateSellerOneSupplier();
        $validated = $request->validate([
            'supplier_product_id' => ['required', 'integer', 'exists:supplier_products,id'],
            'link_parsing_active' => ['required', 'boolean'],
        ]);

        $supplierProduct = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->findOrFail((int) $validated['supplier_product_id']);

        $supplierProduct->update([
            'link_parsing_active' => (bool) $validated['link_parsing_active'],
        ]);

        return response()->json([
            'message' => 'Участие в парсинге обновлено',
            'data' => [
                'id' => $supplierProduct->id,
                'link_parsing_active' => (bool) $supplierProduct->link_parsing_active,
            ],
        ]);
    }

    public function sellerOnePricingSettings(SupplierPriceImportService $service)
    {
        return response()->json([
            'data' => $service->getPricingSettings(),
        ]);
    }

    public function updateSellerOnePricingSettings(Request $request, SupplierPriceImportService $service)
    {
        $validated = $request->validate([
            'price_markup' => ['required', 'numeric', 'min:0'],
            'price_rate' => ['required', 'numeric', 'min:0'],
            'price_fixed_fee' => ['required', 'numeric'],
            'price_precision' => ['required', 'integer', 'min:0', 'max:4'],
        ]);

        return response()->json([
            'message' => 'Настройки формулы обновлены',
            'data' => $service->updatePricingSettings($validated),
        ]);
    }

    public function sellerOneRules()
    {
        $supplier = Supplier::query()->where('code', 'supplier-price-xls')->first();
        if (!$supplier) {
            return response()->json(['data' => []]);
        }

        $rules = SellerOneMatchRule::query()
            ->where('supplier_id', $supplier->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $rules]);
    }

    public function createSellerOneRule(Request $request)
    {
        $validated = $request->validate([
            'pattern' => ['required', 'string', 'max:255'],
            'replacement' => ['required', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $supplier = $this->getOrCreateSellerOneSupplier();
        $rule = SellerOneMatchRule::query()->create([
            'supplier_id' => $supplier->id,
            'pattern' => $validated['pattern'],
            'replacement' => $validated['replacement'],
            'is_active' => $validated['is_active'] ?? true,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return response()->json(['message' => 'Правило добавлено', 'data' => $rule], 201);
    }

    public function updateSellerOneRule(Request $request, int $id)
    {
        $validated = $request->validate([
            'pattern' => ['required', 'string', 'max:255'],
            'replacement' => ['required', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $supplier = $this->getOrCreateSellerOneSupplier();
        $rule = SellerOneMatchRule::query()
            ->where('supplier_id', $supplier->id)
            ->findOrFail($id);

        $rule->update([
            'pattern' => $validated['pattern'],
            'replacement' => $validated['replacement'],
            'is_active' => $validated['is_active'] ?? $rule->is_active,
            'sort_order' => $validated['sort_order'] ?? $rule->sort_order,
        ]);

        return response()->json(['message' => 'Правило обновлено', 'data' => $rule->fresh()]);
    }

    public function deleteSellerOneRule(int $id)
    {
        $supplier = $this->getOrCreateSellerOneSupplier();
        $rule = SellerOneMatchRule::query()
            ->where('supplier_id', $supplier->id)
            ->findOrFail($id);

        $rule->delete();

        return response()->json(['message' => 'Правило удалено']);
    }

    public function sellerOneDuplicateVariantLinks(SupplierPriceImportService $service)
    {
        return response()->json([
            'data' => $service->listSellerOneDuplicateVariantLinkGroups(),
        ]);
    }

    private function writeVanilleAudit(int $jobId, string $action, string $summary): void
    {
        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_VANILLE_IMPORT,
                $jobId,
                $action,
                $summary,
            );
        } catch (Throwable) {
        }
    }
}
