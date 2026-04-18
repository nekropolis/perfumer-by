<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Modules\Catalog\Jobs\RunSellerOneParseJob;
use Modules\ImportExport\Services\Vanille\VanilleImportService;
use Modules\Catalog\Models\VanilleImportJob;
use Modules\Catalog\Models\VanilleImportJobLog;
use Modules\Catalog\Models\SupplierProduct;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Models\SellerOneMatchRule;
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

        $this->writeVanilleAudit($job->id, AuditLogService::ACTION_CREATED, 'Обновить все товары: задача поставлена в очередь');

        return response()->json([
            'message' => 'Запущено обновление всех карточек Vanille',
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

    public function previewSupplierPrice(Request $request, SupplierPriceImportService $service)
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:xls,xlsx'],
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
            'file' => ['required', 'file', 'mimes:xls,xlsx'],
        ]);

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
            return response()->json([
                'message' => 'Статус задачи не найден',
            ], 404);
        }

        return response()->json([
            'data' => $status,
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
        $activeJobId = Cache::get(RunSellerOneParseJob::activeKey());
        if (!is_string($activeJobId) || $activeJobId === '') {
            return response()->json(['data' => null]);
        }

        $status = Cache::get(RunSellerOneParseJob::cacheKey($activeJobId));
        if (!$status) {
            // Ключ активности есть, а статуса уже нет (TTL / ручная очистка).
            // Снимаем флаг активности, чтобы не оставаться в противоречивом состоянии.
            Cache::forget(RunSellerOneParseJob::activeKey());
            return response()->json(['data' => null]);
        }

        $statusName = is_array($status) ? ($status['status'] ?? null) : null;
        if ($statusName === 'completed' || $statusName === 'failed') {
            // Job уже финализирован — в discovery-эндпоинте такое не отдаём,
            // иначе виджет будет бесконечно показывать «завершено». Сам клиент
            // продолжит видеть финальный статус через status/{jobId}, если ему надо.
            Cache::forget(RunSellerOneParseJob::activeKey());
            return response()->json(['data' => null]);
        }

        return response()->json(['data' => $status]);
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

    public function refreshSellerOnePrices(Request $request, SupplierPriceImportService $service)
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:xls,xlsx'],
        ]);

        $result = $service->refreshLinkedPrices($validated['file']);

        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_VANILLE_IMPORT,
                null,
                AuditLogService::ACTION_UPDATED,
                'Seller One: обновлены цены связанных товаров из прайса',
                [
                    'operation' => 'seller_one_refresh_linked_prices',
                    'file_name' => $validated['file']->getClientOriginalName(),
                    'updated' => (int) ($result['updated'] ?? 0),
                    'skipped' => (int) ($result['skipped'] ?? 0),
                    'price_history_rows' => (int) ($result['price_history_rows'] ?? 0),
                    'missing_codes' => (int) ($result['missing_codes'] ?? 0),
                    'deactivated_offers' => (int) ($result['deactivated_offers'] ?? 0),
                    'deactivated_variants' => (int) ($result['deactivated_variants'] ?? 0),
                    'codes_in_price' => (int) ($result['codes_in_price'] ?? 0),
                    'linked_products' => (int) ($result['linked_products'] ?? 0),
                ]
            );
        } catch (Throwable) {
        }

        return response()->json($result);
    }

    public function sellerOneSupplierProducts(Request $request)
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

        $query = clone $baseQuery;

        $status = trim($request->string('status')->toString());
        if ($status === 'confirmed') {
            $query->where('is_linked', true);
        } elseif ($status === 'found_unconfirmed') {
            $query->where('is_linked', false)
                ->whereNotNull('payload->suggested_variant_id')
                ->where(function ($q) {
                    $q->whereNull('payload->match_confidence')
                        ->orWhere('payload->match_confidence', '<', 95);
                });
        } elseif ($status === 'new') {
            $query->where('is_linked', false)->where('payload->is_new', true);
        } elseif ($status === 'unlinked') {
            $query->where('is_linked', false)->where(function ($q) {
                $q->whereNull('payload->suggested_variant_id');
            });
        }

        $items = $query->paginate(50);

        $stats = [
            'confirmed' => (clone $baseQuery)
                ->where('is_linked', true)
                ->count(),
            'found_unconfirmed' => (clone $baseQuery)
                ->where('is_linked', false)
                ->whereNotNull('payload->suggested_variant_id')
                ->where(function ($q) {
                    $q->whereNull('payload->match_confidence')
                        ->orWhere('payload->match_confidence', '<', 95);
                })
                ->count(),
            'new' => (clone $baseQuery)
                ->where('is_linked', false)
                ->where('payload->is_new', true)
                ->count(),
            'unlinked' => (clone $baseQuery)
                ->where('is_linked', false)
                ->where(function ($q) {
                    $q->whereNull('payload->suggested_variant_id');
                })
                ->count(),
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

            return [
                'id' => $item->id,
                'external_name' => $item->external_name,
                'external_slug' => $item->external_slug,
                'external_url' => $item->external_url,
                'is_linked' => (bool) $item->is_linked,
                'is_active' => (bool) $item->is_active,
                'last_seen_at' => optional($item->last_seen_at)?->toDateTimeString(),
                'code' => $externalCode,
                'supplier_price' => $payload['supplier_price'] ?? ($payload['min_price'] ?? null),
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
                    'slug' => $item->product->slug,
                ] : null,
                'suggested_variant' => $suggestedVariant ? [
                    'id' => $suggestedVariant->id,
                    'product_id' => $suggestedVariant->product_id,
                    'product_name' => $suggestedVariant->product?->name,
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
            'price_intermediate_precision' => ['required', 'integer', 'min:0', 'max:4'],
            'price_final_precision' => ['required', 'integer', 'min:0', 'max:4'],
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
