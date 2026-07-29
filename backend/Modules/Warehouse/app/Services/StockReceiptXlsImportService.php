<?php

namespace Modules\Warehouse\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Support\CatalogProductAttributeIds;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantLinkAutoCreator;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptImport;
use Modules\Warehouse\Models\StockReceiptImportMapping;
use Modules\Warehouse\Models\StockReceiptImportRow;

class StockReceiptXlsImportService
{
    private const IMPORT_FILE_DISK = 'local';

    private const IMPORT_FILE_PREFIX = 'stock-receipt-imports';

    private const RESOLVE_BATCH_MAX = 150;

    public function __construct(
        private readonly StockReceiptService $receiptService,
        private readonly StockInventoryService $inventoryService,
        private readonly SupplierPriceImportService $supplierPriceImportService,
        private readonly SellerOneVariantMatcher $variantMatcher,
        private readonly SellerOneVariantLinkAutoCreator $variantLinkAutoCreator,
    ) {
    }

    private ?Collection $brands = null;
    private ?Collection $matchRules = null;

    /**
     * Индекс продуктов по brand_id (как в SupplierPriceImportService), не вариантов.
     * SellerOneVariantMatcher ожидает коллекцию Product с eager-loaded variants — иначе
     * перебираются все SKU бренда на каждую строку XLS и импорт упирается в таймаут 504.
     *
     * @var array<int, list<Product>>|null
     */
    private ?array $productsIndex = null;

    public function import(UploadedFile $file, array $payload): StockReceipt
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(300);
        }
        if (function_exists('ini_set')) {
            @ini_set('memory_limit', '768M');
        }

        $rows = $this->readRows($file);
        $aggregated = $this->aggregateRows($rows);
        $mappingIndex = $this->buildMappingIndex($payload['mapping'] ?? []);

        $items = [];
        $unresolved = [];

        foreach ($aggregated as $row) {
            $processed = $this->processAggregatedRow($row, $mappingIndex);
            if ($processed['resolved']) {
                $items[] = [
                    'product_id' => $processed['product_id'],
                    'variant_id' => $processed['variant_id'],
                    'qty' => (int) $row['qty'],
                    'supplier_price' => (float) ($row['supplier_price'] ?? 0),
                    'supplier_sku' => $row['code'] ?: null,
                ];
                continue;
            }

            $unresolved[] = $processed['unresolved'];
        }

        if (!empty($unresolved)) {
            throw new HttpResponseException(
                response()->json([
                    'message' => 'Не удалось сопоставить часть строк XLS',
                    'unresolved' => $unresolved,
                    'unresolved_count' => count($unresolved),
                    'mapping_required' => true,
                ], 422)
            );
        }

        if (empty($items)) {
            abort(422, 'В XLS нет валидных строк для прихода');
        }

        $this->storeMappings($aggregated, $mappingIndex);

        return $this->receiptService->store([
            'warehouse_id' => (int) ($payload['warehouse_id'] ?? $this->inventoryService->getDefaultSupplierWarehouseId()),
            'supplier_id' => $payload['supplier_id'] ?? null,
            'supplier_code' => $payload['supplier_code'] ?? null,
            'supplier_name' => trim((string) ($payload['supplier_name'] ?? 'XLS import')),
            'received_at' => $payload['received_at'] ?? now()->toDateTimeString(),
            'comment' => $payload['comment'] ?? 'Импорт прихода из XLS',
            'items' => $items,
        ]);
    }

    /**
     * Загрузка XLS в БД. Тот же content_hash при open-импорте — reuse.
     *
     * @return array{import_id: string, total_rows: int, reused: bool}
     */
    public function prepareImportSession(UploadedFile $file): array
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(300);
        }

        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $ext = strtolower($file->getClientOriginalExtension() ?: 'xlsx');
        if (!in_array($ext, ['xls', 'xlsx'], true)) {
            abort(422, 'Файл должен быть XLS или XLSX');
        }

        $realPath = $file->getRealPath();
        if ($realPath === false || !is_readable($realPath)) {
            throw new \RuntimeException('Не удалось прочитать загруженный файл');
        }

        $contentHash = hash_file('sha256', $realPath);
        if ($contentHash === false) {
            throw new \RuntimeException('Не удалось вычислить hash файла');
        }

        $existing = StockReceiptImport::query()
            ->where('content_hash', $contentHash)
            ->where('status', StockReceiptImport::STATUS_OPEN)
            ->orderByDesc('id')
            ->first();

        if ($existing) {
            return [
                'import_id' => $existing->uuid,
                'total_rows' => $existing->rows()->count(),
                'reused' => true,
            ];
        }

        $rows = $this->readRowsFromAbsolutePath($realPath);
        $aggregated = $this->aggregateRows($rows);
        if ($aggregated === []) {
            abort(422, 'В XLS нет валидных строк для прихода');
        }

        return DB::transaction(function () use ($file, $ext, $contentHash, $aggregated, $userId) {
            $uuid = (string) Str::uuid();
            $dir = self::IMPORT_FILE_PREFIX . '/' . $uuid;
            Storage::disk(self::IMPORT_FILE_DISK)->makeDirectory($dir);
            $relativePath = $file->storeAs($dir, 'upload.' . $ext, self::IMPORT_FILE_DISK);
            if ($relativePath === false) {
                throw new \RuntimeException('Не удалось сохранить загруженный файл');
            }

            $import = StockReceiptImport::query()->create([
                'uuid' => $uuid,
                'content_hash' => $contentHash,
                'original_filename' => $file->getClientOriginalName(),
                'file_path' => $relativePath,
                'status' => StockReceiptImport::STATUS_OPEN,
                'created_by' => $userId,
                'comment' => 'Импорт прихода из XLS',
            ]);

            $now = now();
            $insert = [];
            foreach ($aggregated as $row) {
                $insert[] = [
                    'import_id' => $import->id,
                    'map_key' => (string) $row['map_key'],
                    'supplier_sku' => ($row['code'] ?? '') !== '' ? (string) $row['code'] : null,
                    'source_title' => ($row['title'] ?? '') !== '' ? (string) $row['title'] : null,
                    'qty' => (int) ($row['qty'] ?? 0),
                    'supplier_price' => $row['supplier_price'] ?? null,
                    'resolve_status' => StockReceiptImportRow::RESOLVE_PENDING,
                    'receipt_status' => StockReceiptImportRow::RECEIPT_PENDING,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            foreach (array_chunk($insert, 500) as $chunk) {
                StockReceiptImportRow::query()->insert($chunk);
            }

            return [
                'import_id' => $import->uuid,
                'total_rows' => count($aggregated),
                'reused' => false,
            ];
        });
    }

    /**
     * Сопоставляет пачку ещё не разобранных строк импорта.
     *
     * @return array{
     *     next_offset: int,
     *     total_rows: int,
     *     pending_resolve: int,
     *     done: bool,
     *     unresolved: list<array<string, mixed>>
     * }
     */
    public function resolveImportBatch(string $importUuid, int $offset, int $limit): array
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(180);
        }
        if (function_exists('ini_set')) {
            @ini_set('memory_limit', '768M');
        }

        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $import = $this->findOpenImportOrFail($importUuid);
        $total = $import->rows()->count();
        $limit = max(1, min($limit, self::RESOLVE_BATCH_MAX));

        $this->productsIndex = null;

        try {
            $pendingRows = StockReceiptImportRow::query()
                ->where('import_id', $import->id)
                ->where('resolve_status', StockReceiptImportRow::RESOLVE_PENDING)
                ->orderBy('id')
                ->limit($limit)
                ->get();

            $batchUnresolved = [];
            $mappingIndex = [];

            foreach ($pendingRows as $dbRow) {
                $row = $this->dbRowToAggregate($dbRow);
                $processed = $this->processAggregatedRow($row, $mappingIndex);
                $unresolved = $processed['unresolved'] ?? [];

                if ($processed['resolved']) {
                    $dbRow->variant_id = (int) $processed['variant_id'];
                    $dbRow->product_id = (int) $processed['product_id'];
                    $dbRow->resolve_status = StockReceiptImportRow::RESOLVE_MATCHED;
                    $dbRow->suggestion = $unresolved;
                    $dbRow->save();
                } else {
                    $dbRow->resolve_status = StockReceiptImportRow::RESOLVE_UNMATCHED;
                    $dbRow->suggestion = $unresolved;
                    $dbRow->save();
                }

                $batchUnresolved[] = $this->rowToUiPayload($dbRow->fresh());
            }

            $pendingResolve = StockReceiptImportRow::query()
                ->where('import_id', $import->id)
                ->where('resolve_status', StockReceiptImportRow::RESOLVE_PENDING)
                ->count();

            $resolvedCount = $total - $pendingResolve;

            return [
                'next_offset' => $resolvedCount,
                'total_rows' => $total,
                'pending_resolve' => $pendingResolve,
                'done' => $pendingResolve === 0,
                'unresolved' => $batchUnresolved,
            ];
        } finally {
            $this->productsIndex = null;
            $this->brands = null;
            $this->matchRules = null;
            if (function_exists('gc_collect_cycles')) {
                gc_collect_cycles();
            }
        }
    }

    /**
     * Добавляет в черновик прихода только pending-строки с variant_id (row locks).
     *
     * @return array{
     *     receipt: StockReceipt,
     *     committed_map_keys: list<string>,
     *     committed_rows_count: int,
     *     created_new_receipt: bool
     * }
     */
    public function commitImportSession(string $importUuid, array $payload): array
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(300);
        }

        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $import = $this->findOpenImportOrFail($importUuid);

        $pendingResolve = StockReceiptImportRow::query()
            ->where('import_id', $import->id)
            ->where('resolve_status', StockReceiptImportRow::RESOLVE_PENDING)
            ->exists();
        if ($pendingResolve) {
            throw new HttpResponseException(
                response()->json([
                    'message' => 'Импорт неполный: сначала дождись окончания разбора по пакетам.',
                    'unresolved' => [],
                    'unresolved_count' => 0,
                    'mapping_required' => false,
                ], 422)
            );
        }

        return DB::transaction(function () use ($import, $payload, $userId) {
            $import = StockReceiptImport::query()->lockForUpdate()->findOrFail($import->id);

            $mappingIndex = $this->buildMappingIndex($payload['mapping'] ?? []);
            $restrictToMappedKeysOnly = $this->mappingPayloadHasVariants($payload['mapping'] ?? []);

            if ($mappingIndex !== []) {
                foreach ($mappingIndex as $mapKey => $variantId) {
                    if (!is_string($mapKey) || !str_contains((string) $mapKey, ':')) {
                        continue;
                    }
                    $variantId = (int) $variantId;
                    if ($variantId <= 0) {
                        continue;
                    }
                    $variant = ProductVariantLink::query()->find($variantId);
                    if (!$variant) {
                        continue;
                    }
                    $row = StockReceiptImportRow::query()
                        ->where('import_id', $import->id)
                        ->where('map_key', $mapKey)
                        ->lockForUpdate()
                        ->first();
                    if (!$row || $row->receipt_status === StockReceiptImportRow::RECEIPT_IN_RECEIPT) {
                        continue;
                    }
                    $row->variant_id = $variantId;
                    $row->product_id = (int) $variant->product_id;
                    $row->resolve_status = StockReceiptImportRow::RESOLVE_MATCHED;
                    $row->linked_by = $userId;
                    $suggestion = is_array($row->suggestion) ? $row->suggestion : [];
                    $catalog = $this->formatCatalogVariantForUi($variantId, null);
                    if ($catalog) {
                        $suggestion['linked_variant'] = $catalog;
                        if (empty($suggestion['suggested_variant'])) {
                            $suggestion['suggested_variant'] = $catalog;
                        }
                    }
                    $row->suggestion = $suggestion;
                    $row->save();
                }
            }

            $query = StockReceiptImportRow::query()
                ->where('import_id', $import->id)
                ->where('receipt_status', StockReceiptImportRow::RECEIPT_PENDING)
                ->whereNotNull('variant_id')
                ->where('variant_id', '>', 0)
                ->orderBy('id')
                ->lockForUpdate();

            if ($restrictToMappedKeysOnly) {
                $keys = array_values(array_filter(array_keys($mappingIndex), static fn ($k) => is_string($k)));
                $query->whereIn('map_key', $keys);
            }

            /** @var \Illuminate\Support\Collection<int, StockReceiptImportRow> $rows */
            $rows = $query->get();

            $items = [];
            $rowsForMappings = [];
            $commitRows = [];

            foreach ($rows as $dbRow) {
                if ($dbRow->receipt_status === StockReceiptImportRow::RECEIPT_IN_RECEIPT) {
                    continue;
                }
                $variantId = (int) $dbRow->variant_id;
                $variant = ProductVariantLink::query()->find($variantId);
                if (!$variant) {
                    continue;
                }

                $items[] = [
                    'product_id' => (int) $variant->product_id,
                    'variant_id' => $variantId,
                    'qty' => (int) $dbRow->qty,
                    'supplier_price' => (float) ($dbRow->supplier_price ?? 0),
                    'supplier_sku' => $dbRow->supplier_sku,
                ];
                $rowsForMappings[] = $this->dbRowToAggregate($dbRow);
                $commitRows[] = $dbRow;
            }

            if ($items === []) {
                abort(422, 'Нет строк для добавления: сопоставьте хотя бы одну новую позицию (ещё не попавшую в приход).');
            }

            $this->storeMappings($rowsForMappings, $this->buildMappingIndex(
                array_map(static fn (StockReceiptImportRow $r) => [
                    'map_key' => $r->map_key,
                    'variant_id' => (int) $r->variant_id,
                    'code' => $r->supplier_sku,
                    'title' => $r->source_title,
                ], $commitRows)
            ));

            if (!empty($payload['warehouse_id'])) {
                $import->warehouse_id = (int) $payload['warehouse_id'];
            }
            if (array_key_exists('supplier_id', $payload)) {
                $import->supplier_id = $payload['supplier_id'] !== null ? (int) $payload['supplier_id'] : null;
            }
            if (!empty($payload['received_at'])) {
                $import->received_at = $payload['received_at'];
            }
            if (array_key_exists('comment', $payload)) {
                $import->comment = $payload['comment'];
            }
            $import->save();

            $warehouseId = (int) ($payload['warehouse_id'] ?? $import->warehouse_id ?? $this->inventoryService->getDefaultSupplierWarehouseId());
            $targetReceiptId = (int) ($import->target_stock_receipt_id ?? 0);
            $createdNew = false;
            $beforeMaxItemId = 0;

            if ($targetReceiptId > 0) {
                $receipt = StockReceipt::query()->lockForUpdate()->findOrFail($targetReceiptId);
                if ($receipt->status !== StockReceipt::STATUS_DRAFT) {
                    abort(422, 'Документ прихода уже оприходован. Сбрось привязку к документу или закрой импорт.');
                }
                $payloadWarehouse = (int) ($payload['warehouse_id'] ?? 0);
                if ($payloadWarehouse > 0 && $payloadWarehouse !== (int) $receipt->warehouse_id) {
                    abort(422, 'Склад в форме не совпадает со складом выбранного прихода');
                }
                $beforeMaxItemId = (int) $receipt->items()->max('id');
                $receipt = $this->receiptService->appendDraftItems($receipt, $items);
            } else {
                $receipt = $this->receiptService->store([
                    'warehouse_id' => $warehouseId,
                    'supplier_id' => $payload['supplier_id'] ?? $import->supplier_id,
                    'supplier_code' => $payload['supplier_code'] ?? null,
                    'supplier_name' => trim((string) ($payload['supplier_name'] ?? 'XLS import')),
                    'received_at' => $payload['received_at'] ?? $import->received_at?->toDateTimeString() ?? now()->toDateTimeString(),
                    'comment' => $payload['comment'] ?? $import->comment ?? 'Импорт прихода из XLS',
                    'items' => $items,
                ]);
                $createdNew = true;
                $import->target_stock_receipt_id = $receipt->id;
                $import->save();
            }

            $newItems = $receipt->items
                ->filter(static fn ($item) => (int) $item->id > $beforeMaxItemId)
                ->values();

            $newlyCommittedKeys = [];
            foreach ($commitRows as $index => $dbRow) {
                $item = $newItems->get($index);
                $dbRow->receipt_status = StockReceiptImportRow::RECEIPT_IN_RECEIPT;
                $dbRow->stock_receipt_id = $receipt->id;
                $dbRow->stock_receipt_item_id = $item?->id;
                $dbRow->committed_by = $userId;
                $dbRow->committed_at = now();
                $dbRow->save();
                $newlyCommittedKeys[] = $dbRow->map_key;
            }

            return [
                'receipt' => $receipt->fresh(['supplier', 'items', 'warehouse']),
                'committed_map_keys' => $newlyCommittedKeys,
                'committed_rows_count' => count($newlyCommittedKeys),
                'created_new_receipt' => $createdNew,
            ];
        });
    }

    public function clearImportSessionReceiptTarget(string $importUuid): void
    {
        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $import = $this->findOpenImportOrFail($importUuid);
        $import->target_stock_receipt_id = null;
        $import->save();
    }

    /**
     * @return array{
     *     import_id: string,
     *     status: string,
     *     total_rows: int,
     *     pending_resolve: int,
     *     pending_receipt: int,
     *     in_receipt: int,
     *     warehouse_id: int|null,
     *     supplier_id: int|null,
     *     received_at: string|null,
     *     comment: string|null,
     *     target_stock_receipt_id: int|null,
     *     original_filename: string|null,
     *     rows: list<array<string, mixed>>
     * }
     */
    public function getImport(string $importUuid): array
    {
        $import = $this->findImportOrFail($importUuid);
        $rows = $import->rows()->orderBy('id')->get();

        return $this->formatImportState($import, $rows);
    }

    /**
     * @return array{data: array<string, mixed>|null}
     */
    public function getLatestOpenImportState(): array
    {
        $import = StockReceiptImport::query()
            ->where('status', StockReceiptImport::STATUS_OPEN)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();

        if (!$import) {
            return ['data' => null];
        }

        $rows = $import->rows()->orderBy('id')->get();

        return ['data' => $this->formatImportState($import, $rows)];
    }

    /**
     * @param  array{map_key: string, variant_id: int}  $payload
     * @return array<string, mixed>
     */
    public function linkImportRow(string $importUuid, array $payload): array
    {
        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $import = $this->findOpenImportOrFail($importUuid);
        $mapKey = trim((string) ($payload['map_key'] ?? ''));
        $variantId = (int) ($payload['variant_id'] ?? 0);
        if ($mapKey === '' || $variantId <= 0) {
            abort(422, 'Нужны map_key и variant_id');
        }

        return DB::transaction(function () use ($import, $mapKey, $variantId, $userId) {
            $row = StockReceiptImportRow::query()
                ->where('import_id', $import->id)
                ->where('map_key', $mapKey)
                ->lockForUpdate()
                ->firstOrFail();

            if ($row->receipt_status === StockReceiptImportRow::RECEIPT_IN_RECEIPT) {
                abort(422, 'Строка уже добавлена в приход');
            }

            $variant = ProductVariantLink::query()->findOrFail($variantId);
            $row->variant_id = (int) $variant->id;
            $row->product_id = (int) $variant->product_id;
            $row->resolve_status = StockReceiptImportRow::RESOLVE_MATCHED;
            $row->linked_by = $userId;
            $suggestion = is_array($row->suggestion) ? $row->suggestion : [];
            $catalog = $this->formatCatalogVariantForUi((int) $variant->id, null);
            if ($catalog) {
                $suggestion['linked_variant'] = $catalog;
                $suggestion['suggested_variant'] = $catalog;
                $suggestion['match_confidence'] = 100;
                $suggestion['auto_resolved'] = false;
            }
            $row->suggestion = $suggestion;
            $row->save();

            $this->storeMappings(
                [$this->dbRowToAggregate($row)],
                [$row->map_key => (int) $variant->id]
            );

            return $this->rowToUiPayload($row);
        });
    }

    public function closeImport(string $importUuid): void
    {
        $import = $this->findOpenImportOrFail($importUuid);
        $import->status = StockReceiptImport::STATUS_CLOSED;
        $import->save();
    }

    /**
     * Сброс строк импорта после purge прихода — снова можно добавить в новый документ.
     */
    public function resetRowsForPurgedReceipt(int $stockReceiptId): int
    {
        $rows = StockReceiptImportRow::query()
            ->where('stock_receipt_id', $stockReceiptId)
            ->get();

        $count = 0;
        foreach ($rows as $row) {
            $row->receipt_status = StockReceiptImportRow::RECEIPT_PENDING;
            $row->stock_receipt_id = null;
            $row->stock_receipt_item_id = null;
            $row->committed_by = null;
            $row->committed_at = null;
            $row->save();
            $count++;
        }

        $importIds = $rows->pluck('import_id')->unique()->filter();
        foreach ($importIds as $importId) {
            $import = StockReceiptImport::query()->find($importId);
            if ($import && (int) $import->target_stock_receipt_id === $stockReceiptId) {
                $import->target_stock_receipt_id = null;
                if ($import->status === StockReceiptImport::STATUS_CLOSED) {
                    $import->status = StockReceiptImport::STATUS_OPEN;
                }
                $import->save();
            }
        }

        return $count;
    }

    private function findOpenImportOrFail(string $importUuid): StockReceiptImport
    {
        $import = $this->findImportOrFail($importUuid);
        if ($import->status !== StockReceiptImport::STATUS_OPEN) {
            abort(422, 'Импорт закрыт');
        }

        return $import;
    }

    private function findImportOrFail(string $importUuid): StockReceiptImport
    {
        if (!Str::isUuid($importUuid)) {
            abort(422, 'Некорректный import_id');
        }

        $import = StockReceiptImport::query()->where('uuid', $importUuid)->first();
        if (!$import) {
            abort(404, 'Импорт не найден');
        }

        return $import;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, StockReceiptImportRow>  $rows
     * @return array<string, mixed>
     */
    private function formatImportState(StockReceiptImport $import, $rows): array
    {
        $uiRows = [];
        $mappingByKey = [];
        foreach ($rows as $row) {
            $payload = $this->rowToUiPayload($row);
            $uiRows[] = $payload;
            if ($row->variant_id && $row->receipt_status !== StockReceiptImportRow::RECEIPT_IN_RECEIPT) {
                $mappingByKey[$row->map_key] = (string) $row->variant_id;
            } elseif ($row->variant_id && $row->receipt_status === StockReceiptImportRow::RECEIPT_IN_RECEIPT) {
                $mappingByKey[$row->map_key] = (string) $row->variant_id;
            }
        }

        return [
            'import_id' => $import->uuid,
            'status' => $import->status,
            'total_rows' => $rows->count(),
            'pending_resolve' => $rows->where('resolve_status', StockReceiptImportRow::RESOLVE_PENDING)->count(),
            'pending_receipt' => $rows->where('receipt_status', StockReceiptImportRow::RECEIPT_PENDING)->count(),
            'in_receipt' => $rows->where('receipt_status', StockReceiptImportRow::RECEIPT_IN_RECEIPT)->count(),
            'warehouse_id' => $import->warehouse_id ? (int) $import->warehouse_id : null,
            'supplier_id' => $import->supplier_id ? (int) $import->supplier_id : null,
            'received_at' => $import->received_at?->format('Y-m-d\TH:i') ?? null,
            'comment' => $import->comment,
            'target_stock_receipt_id' => $import->target_stock_receipt_id ? (int) $import->target_stock_receipt_id : null,
            'original_filename' => $import->original_filename,
            'rows' => $uiRows,
            'mapping_by_key' => $mappingByKey,
        ];
    }

    private function dbRowToAggregate(StockReceiptImportRow $row): array
    {
        return [
            'map_key' => $row->map_key,
            'code' => (string) ($row->supplier_sku ?? ''),
            'title' => (string) ($row->source_title ?? ''),
            'qty' => (int) $row->qty,
            'supplier_price' => $row->supplier_price !== null ? (float) $row->supplier_price : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function rowToUiPayload(StockReceiptImportRow $row): array
    {
        $suggestion = is_array($row->suggestion) ? $row->suggestion : [];
        $base = array_merge([
            'map_key' => $row->map_key,
            'code' => (string) ($row->supplier_sku ?? ''),
            'title' => (string) ($row->source_title ?? ''),
            'qty' => (int) $row->qty,
            'supplier_price' => $row->supplier_price !== null ? (float) $row->supplier_price : null,
            'parsed' => null,
            'suggested_variant' => null,
            'suggested_product' => null,
            'match_confidence' => 0,
            'match_confidence_breakdown' => null,
            'linked_variant' => null,
            'auto_resolved' => false,
        ], $suggestion);

        $base['map_key'] = $row->map_key;
        $base['code'] = (string) ($row->supplier_sku ?? '');
        $base['title'] = (string) ($row->source_title ?? '');
        $base['qty'] = (int) $row->qty;
        $base['supplier_price'] = $row->supplier_price !== null ? (float) $row->supplier_price : null;
        $base['receipt_status'] = $row->receipt_status;
        $base['resolve_status'] = $row->resolve_status;
        $base['stock_receipt_id'] = $row->stock_receipt_id ? (int) $row->stock_receipt_id : null;

        if ($row->variant_id && empty($base['linked_variant'])) {
            $catalog = $this->formatCatalogVariantForUi((int) $row->variant_id, null);
            if ($catalog) {
                $base['linked_variant'] = $catalog;
                if (empty($base['suggested_variant'])) {
                    $base['suggested_variant'] = $catalog;
                }
            }
        }

        if ($row->receipt_status === StockReceiptImportRow::RECEIPT_IN_RECEIPT) {
            $base['in_receipt'] = true;
        }

        return $base;
    }

    /**
     * @return array{
     *     resolved: true,
     *     product_id: int,
     *     variant_id: int,
     *     unresolved: array<string, mixed>,
     * }|array{
     *     resolved: false,
     *     unresolved: array<string, mixed>,
     * }
     */
    private function processAggregatedRow(array $row, array $mappingIndex): array
    {
        $resolved = $this->resolveVariantFromMapping($row, $mappingIndex);
        if (!$resolved) {
            $resolved = $this->resolveVariantFromStoredMapping($row);
        }

        if (!$resolved && $this->variantMatcher->shouldSkipParsingRow([
            'code' => $row['code'] ?? '',
            'title' => $row['title'] ?? '',
        ])) {
            return [
                'resolved' => false,
                'unresolved' => $this->buildUnresolvedRowFromParsed($row, [
                    'parsed' => ['skip_auto_match' => true],
                    'suggested_variant' => null,
                    'suggested_product' => null,
                ]),
            ];
        }

        $parsed = null;
        if (!$resolved) {
            $parsed = $this->parseImportRowWithMatcher($row);
            if ($this->canAutoResolveReceiptLink($parsed)) {
                $variantId = (int) ($parsed['selected_variant_id'] ?? $parsed['suggested_variant']['id'] ?? 0);
                $variant = ProductVariantLink::query()->find($variantId);
                if ($variant) {
                    $resolved = [
                        'product_id' => (int) $variant->product_id,
                        'variant_id' => (int) $variant->id,
                    ];
                }
            }
        }

        if ($resolved) {
            return [
                'resolved' => true,
                'product_id' => $resolved['product_id'],
                'variant_id' => $resolved['variant_id'],
                'unresolved' => $this->buildUnresolvedRowFromAutoResolved(
                    $row,
                    (int) $resolved['variant_id'],
                    $parsed,
                ),
            ];
        }

        return [
            'resolved' => false,
            'unresolved' => $this->buildUnresolvedRowFromParsed($row, $parsed ?? []),
        ];
    }

    private function readRows(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        if ($path === false || !is_readable($path)) {
            throw new \RuntimeException('Не удалось прочитать загруженный файл');
        }

        return $this->readRowsFromAbsolutePath($path);
    }

    private function readRowsFromAbsolutePath(string $absolutePath): array
    {
        $ioFactoryClass = '\\PhpOffice\\PhpSpreadsheet\\IOFactory';
        if (!class_exists($ioFactoryClass)) {
            throw new \RuntimeException('Не установлен phpoffice/phpspreadsheet. Выполни composer install в backend.');
        }

        if (!is_readable($absolutePath)) {
            throw new \RuntimeException('Файл недоступен для чтения');
        }

        $spreadsheet = $ioFactoryClass::load($absolutePath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray();
        $result = [];

        foreach ($rows as $index => $row) {
            $code = trim((string) ($row[0] ?? ''));
            $title = trim((string) ($row[1] ?? ''));
            $price = $this->toFloat($row[2] ?? null);
            $qty = (int) round((float) ($this->toFloat($row[3] ?? null) ?? 0));

            if ($index === 0 && Str::lower($code) === 'код') {
                continue;
            }

            if ($title === '' || $qty <= 0) {
                continue;
            }

            $result[] = [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $price,
                'qty' => $qty,
            ];
        }

        return $result;
    }

    private function aggregateRows(array $rows): array
    {
        $result = [];

        foreach ($rows as $index => $row) {
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));
            $normalizedTitle = $this->normalizeExactTitle($title);
            $priceKey = $row['supplier_price'] ?? '';
            $priceSuffix = '|p:' . (is_numeric($priceKey) ? number_format((float) $priceKey, 2, '.', '') : '');
            $baseKey = $code !== ''
                ? "sku:{$code}{$priceSuffix}"
                : 'title:' . $normalizedTitle . $priceSuffix;

            $result[] = [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $row['supplier_price'],
                'qty' => (int) ($row['qty'] ?? 0),
                'map_key' => $baseKey . '|row:' . ($index + 1),
            ];
        }

        return $result;
    }

    /**
     * Как tryAutoConfirmLink в Seller One: 100% + exact/exact_multiset имени.
     *
     * @param  array<string, mixed>  $parsed
     */
    private function canAutoResolveReceiptLink(array $parsed): bool
    {
        $confidence = (int) ($parsed['suggested_variant']['confidence'] ?? 0);
        $variantId = (int) ($parsed['selected_variant_id'] ?? $parsed['suggested_variant']['id'] ?? 0);
        if ($confidence < 100 || $variantId <= 0) {
            return false;
        }

        $nameLevel = (string) ($parsed['suggested_variant']['confidence_breakdown']['name_match_level'] ?? '');

        return in_array($nameLevel, ['exact', 'exact_multiset'], true);
    }

    private function toFloat(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }

        $string = trim((string) $value);
        if ($string === '') {
            return null;
        }

        $string = str_replace([' ', ','], ['', '.'], $string);
        if (!is_numeric($string)) {
            return null;
        }

        return (float) $string;
    }

    private function normalizeExactTitle(string $value): string
    {
        $normalized = mb_strtolower(trim($value));
        $normalized = str_replace('ё', 'е', $normalized);
        $normalized = preg_replace('/\s+/u', ' ', $normalized) ?: '';

        return trim($normalized);
    }

    private function getBrands(): Collection
    {
        if ($this->brands === null) {
            $this->brands = Brand::query()
                ->select(['id', 'name'])
                ->get();
        }

        return $this->brands;
    }

    private function getMatchRules(): Collection
    {
        if ($this->matchRules === null) {
            $supplier = $this->supplierPriceImportService->getOrCreateSellerOneSupplier();
            $this->matchRules = SellerOneMatchRule::query()
                ->where('supplier_id', $supplier->id)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get();
        }

        return $this->matchRules;
    }

    /**
     * @return array<int, list<Product>>
     */
    private function getProductsIndex(): array
    {
        if ($this->productsIndex !== null) {
            return $this->productsIndex;
        }

        $this->productsIndex = $this->buildProductsIndexFromDb();

        return $this->productsIndex;
    }

    /**
     * @return array<int, list<Product>>
     */
    private function buildProductsIndexFromDb(): array
    {
        $grouped = [];

        foreach (
            Product::query()
                ->whereNotNull('brand_id')
                ->with([
                    'brand',
                    'variants.definition',
                    'attributeValues' => static fn ($query) => $query->where(
                        'product_attribute_id',
                        CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID,
                    ),
                    'attributeValues.selectedOptions',
                ])
                ->orderBy('id')
                ->cursor() as $product
        ) {
            $grouped[(int) $product->brand_id][] = $product;
        }

        return $grouped;
    }

    /**
     * @param  mixed  $mapping
     */
    private function mappingPayloadHasVariants(mixed $mapping): bool
    {
        if (!is_array($mapping)) {
            return false;
        }

        foreach ($mapping as $row) {
            if (!is_array($row)) {
                continue;
            }
            $variantId = (int) ($row['variant_id'] ?? $row['selected_variant_id'] ?? 0);
            if ($variantId > 0) {
                return true;
            }
        }

        return false;
    }

    private function buildMappingIndex(mixed $mapping): array
    {
        if (!is_array($mapping)) {
            return [];
        }

        $index = [];
        foreach ($mapping as $row) {
            if (!is_array($row)) {
                continue;
            }

            $variantId = (int) ($row['variant_id'] ?? $row['selected_variant_id'] ?? 0);
            if ($variantId <= 0) {
                continue;
            }

            $mapKey = trim((string) ($row['map_key'] ?? ''));
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));

            if ($mapKey !== '') {
                $index[$mapKey] = $variantId;
            }
            if ($code !== '') {
                $index['sku:' . $code] = $variantId;
            } else {
                $index['title:' . $this->normalizeExactTitle($title)] = $variantId;
            }
        }

        return $index;
    }

    private function resolveVariantFromMapping(array $row, array $mappingIndex): ?array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));
        $mapKey = trim((string) ($row['map_key'] ?? ($code !== '' ? 'sku:' . $code : 'title:' . $this->normalizeExactTitle($title))));
        if ($mapKey === '') {
            return null;
        }

        $variantId = (int) ($mappingIndex[$mapKey] ?? 0);
        if ($variantId <= 0) {
            return null;
        }

        $variant = ProductVariantLink::query()->find($variantId);
        if (!$variant) {
            return null;
        }

        return [
            'product_id' => (int) $variant->product_id,
            'variant_id' => (int) $variant->id,
        ];
    }

    /**
     * @param  array{code?: string, title?: string, supplier_price?: mixed, map_key?: string, qty?: int}  $row
     * @return array<string, mixed>
     */
    private function parseImportRowWithMatcher(array $row): array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));

        $parsed = $this->variantMatcher->parseSupplierRow(
            [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $row['supplier_price'] ?? null,
            ],
            $this->getBrands(),
            $this->getMatchRules(),
            $this->getProductsIndex(),
        );

        $parsed = $this->variantLinkAutoCreator->apply(
            $parsed,
            [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $row['supplier_price'] ?? null,
            ],
            $this->getProductsIndex(),
            requirePositiveSupplierPrice: true,
        );

        return $this->enrichParsedBrandId($parsed);
    }

    /**
     * @param  array<string, mixed>  $parsed
     * @return array<string, mixed>
     */
    private function enrichParsedBrandId(array $parsed): array
    {
        $brandName = trim((string) ($parsed['parsed']['brand'] ?? ''));
        if ($brandName === '' || !is_array($parsed['parsed'] ?? null)) {
            return $parsed;
        }

        $normalizedBrand = mb_strtolower($brandName);
        $brand = $this->getBrands()->first(
            static fn (Brand $candidate): bool => mb_strtolower(trim((string) $candidate->name)) === $normalizedBrand,
        );
        if ($brand) {
            $parsed['parsed']['brand_id'] = (int) $brand->id;
        }

        return $parsed;
    }

    private function buildUnresolvedRowFromParsed(array $row, array $parsed): array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));
        $mapKey = trim((string) ($row['map_key'] ?? ($code !== '' ? 'sku:' . $code : 'title:' . $this->normalizeExactTitle($title))));

        return [
            'map_key' => $mapKey,
            'code' => $code,
            'title' => $title,
            'supplier_price' => $row['supplier_price'] ?? null,
            'qty' => (int) ($row['qty'] ?? 0),
            'parsed' => $parsed['parsed'] ?? null,
            'suggested_variant' => $parsed['suggested_variant'] ?? null,
            'suggested_product' => $parsed['suggested_product'] ?? null,
            'match_confidence' => (int) (
                $parsed['suggested_variant']['confidence']
                ?? $parsed['suggested_product']['confidence']
                ?? 0
            ),
            'match_confidence_breakdown' => $parsed['suggested_variant']['confidence_breakdown']
                ?? $parsed['suggested_product']['confidence_breakdown']
                ?? null,
        ];
    }

    /**
     * Строка для UI: автосвязка есть в outcomes, но в таблице показываем галочку «Связка».
     *
     * @param  array<string, mixed>|null  $parsed
     * @return array<string, mixed>
     */
    private function buildUnresolvedRowFromAutoResolved(array $row, int $variantId, ?array $parsed): array
    {
        $base = $parsed !== null && $parsed !== []
            ? $this->buildUnresolvedRowFromParsed($row, $parsed)
            : $this->buildUnresolvedRowFromParsed($row, []);

        $catalogVariant = $this->formatCatalogVariantForUi($variantId, $parsed);
        if ($catalogVariant === null) {
            return $base;
        }

        $base['linked_variant'] = $catalogVariant;
        if ($base['suggested_variant'] === null) {
            $base['suggested_variant'] = $catalogVariant;
        }
        if ((int) ($base['match_confidence'] ?? 0) < 100) {
            $base['match_confidence'] = 100;
        }
        if ($base['match_confidence_breakdown'] === null) {
            $base['match_confidence_breakdown'] = [
                'total' => 100,
                'name_match_level' => 'exact',
            ];
        }
        $base['auto_resolved'] = true;

        return $base;
    }

    /**
     * @param  array<string, mixed>|null  $parsed
     * @return array<string, mixed>|null
     */
    private function formatCatalogVariantForUi(int $variantId, ?array $parsed): ?array
    {
        $variant = ProductVariantLink::query()
            ->with(['product.brand', 'definition'])
            ->find($variantId);
        if (!$variant) {
            return null;
        }

        $product = $variant->product;

        return [
            'id' => (int) $variant->id,
            'product_id' => (int) $variant->product_id,
            'product_name' => $product?->name,
            'display_name' => $product ? ProductDisplayName::forProduct($product) : null,
            'brand_name' => $product?->brand?->name,
            'display' => $this->variantMatcher->buildVariantLabel($variant),
            'confidence' => (int) ($parsed['suggested_variant']['confidence'] ?? 100),
            'confidence_breakdown' => $parsed['suggested_variant']['confidence_breakdown']
                ?? [
                    'total' => 100,
                    'name_match_level' => 'exact',
                ],
        ];
    }

    private function resolveVariantFromStoredMapping(array $row): ?array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));
        $normalizedTitle = $this->normalizeExactTitle($title);

        $mapping = StockReceiptImportMapping::query()
            ->where(function ($query) use ($code, $normalizedTitle) {
                if ($code !== '') {
                    $query->where('supplier_sku', $code);
                }
                if ($normalizedTitle !== '') {
                    $query->orWhereRaw('LOWER(TRIM(COALESCE(source_title, ""))) = ?', [$normalizedTitle]);
                }
            })
            ->orderByDesc('updated_at')
            ->first();

        if (!$mapping) {
            return null;
        }

        $variant = ProductVariantLink::query()->find((int) $mapping->variant_id);
        if (!$variant) {
            return null;
        }

        return [
            'product_id' => (int) $variant->product_id,
            'variant_id' => (int) $variant->id,
        ];
    }

    private function storeMappings(array $aggregatedRows, array $mappingIndex): void
    {
        if (empty($mappingIndex)) {
            return;
        }

        foreach ($aggregatedRows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));
            $mapKey = trim((string) ($row['map_key'] ?? ($code !== '' ? 'sku:' . $code : 'title:' . $this->normalizeExactTitle($title))));
            if ($mapKey === '') {
                continue;
            }

            $variantId = (int) ($mappingIndex[$mapKey] ?? 0);
            if ($variantId <= 0) {
                continue;
            }

            $variant = ProductVariantLink::query()->find($variantId);
            if (!$variant) {
                continue;
            }

            StockReceiptImportMapping::query()->updateOrCreate(
                [
                    'supplier_sku' => $code !== '' ? $code : null,
                    'source_title' => $title !== '' ? $title : null,
                ],
                [
                    'product_id' => (int) $variant->product_id,
                    'variant_id' => (int) $variant->id,
                    'updated_by' => Auth::id(),
                    'created_by' => Auth::id(),
                ]
            );
        }
    }
}
