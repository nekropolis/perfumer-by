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
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptImportMapping;

class StockReceiptXlsImportService
{
    private const IMPORT_SESSION_DISK = 'local';

    private const IMPORT_SESSION_PREFIX = 'stock-receipt-xls-import';

    private const RESOLVE_BATCH_MAX = 150;

    private const TITLE_BRAND_ALIASES = [
        '/^a\.?\s*banderas\b/ui' => 'antonio banderas',
    ];

    public function __construct(
        private readonly StockReceiptService $receiptService,
        private readonly StockInventoryService $inventoryService,
        private readonly SellerOneVariantMatcher $variantMatcher,
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

        $rows = $this->readRows($file);
        $aggregated = $this->aggregateRows($rows);
        $mappingIndex = $this->buildMappingIndex($payload['mapping'] ?? []);

        $items = [];
        $unresolved = [];

        foreach ($aggregated as $row) {
            $resolved = $this->tryResolveAggregatedRow($row, $mappingIndex);
            if (!$resolved) {
                $unresolved[] = $this->buildUnresolvedRow($row);
                continue;
            }

            $items[] = [
                'product_id' => $resolved['product_id'],
                'variant_id' => $resolved['variant_id'],
                'qty' => (int) $row['qty'],
                'supplier_price' => (float) ($row['supplier_price'] ?? 0),
                'supplier_sku' => $row['code'] ?: null,
            ];
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
     * Пошаговый импорт: один раз читает XLS, сохраняет агрегированные строки в storage.
     *
     * @return array{session_id: string, total_rows: int}
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

        $sessionId = (string) Str::uuid();
        $dir = self::IMPORT_SESSION_PREFIX . '/' . $sessionId;
        Storage::disk(self::IMPORT_SESSION_DISK)->makeDirectory($dir);

        $ext = strtolower($file->getClientOriginalExtension() ?: 'xlsx');
        if (!in_array($ext, ['xls', 'xlsx'], true)) {
            Storage::disk(self::IMPORT_SESSION_DISK)->deleteDirectory($dir);
            abort(422, 'Файл должен быть XLS или XLSX');
        }

        $relativePath = $file->storeAs($dir, 'upload.' . $ext, self::IMPORT_SESSION_DISK);
        if ($relativePath === false) {
            Storage::disk(self::IMPORT_SESSION_DISK)->deleteDirectory($dir);
            throw new \RuntimeException('Не удалось сохранить загруженный файл');
        }

        $absolutePath = Storage::disk(self::IMPORT_SESSION_DISK)->path($relativePath);

        $rows = $this->readRowsFromAbsolutePath($absolutePath);
        $aggregated = $this->aggregateRows($rows);

        if ($aggregated === []) {
            Storage::disk(self::IMPORT_SESSION_DISK)->deleteDirectory($dir);
            abort(422, 'В XLS нет валидных строк для прихода');
        }

        Storage::disk(self::IMPORT_SESSION_DISK)->put(
            $dir . '/aggregated.json',
            json_encode($aggregated, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)
        );
        Storage::disk(self::IMPORT_SESSION_DISK)->put(
            $dir . '/meta.json',
            json_encode([
                'user_id' => $userId,
                'total' => count($aggregated),
                'created_at' => now()->toIso8601String(),
                'committed_map_keys' => [],
                'target_stock_receipt_id' => null,
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)
        );
        Storage::disk(self::IMPORT_SESSION_DISK)->put($dir . '/outcomes.json', '{}');

        return [
            'session_id' => $sessionId,
            'total_rows' => count($aggregated),
        ];
    }

    /**
     * Сопоставляет часть строк сессии (короткий запрос — без 504 на прокси).
     *
     * @return array{
     *     next_offset: int,
     *     total_rows: int,
     *     done: bool,
     *     unresolved: list<array<string, mixed>>
     * }
     */
    public function resolveImportBatch(string $sessionId, int $offset, int $limit): array
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(120);
        }

        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $dir = $this->sessionDir($sessionId);
        $this->assertSessionOwned($dir, (int) $userId);

        $aggregated = $this->readSessionJson($dir . '/aggregated.json');
        $outcomes = $this->readSessionJson($dir . '/outcomes.json');
        if (!is_array($outcomes)) {
            $outcomes = [];
        }

        $total = count($aggregated);
        $offset = max(0, $offset);
        $limit = max(1, min($limit, self::RESOLVE_BATCH_MAX));
        $slice = array_slice($aggregated, $offset, $limit);

        $batchUnresolved = [];
        $mappingIndex = [];

        foreach ($slice as $row) {
            $key = trim((string) ($row['map_key'] ?? ''));
            if ($key === '') {
                continue;
            }

            if (array_key_exists($key, $outcomes)) {
                continue;
            }

            $resolved = $this->tryResolveAggregatedRow($row, $mappingIndex);
            if ($resolved) {
                $outcomes[$key] = [
                    'resolved' => true,
                    'product_id' => $resolved['product_id'],
                    'variant_id' => $resolved['variant_id'],
                    'qty' => (int) ($row['qty'] ?? 0),
                    'supplier_price' => (float) ($row['supplier_price'] ?? 0),
                    'code' => $row['code'] ?? '',
                    'title' => $row['title'] ?? '',
                ];
            } else {
                $unresolvedRow = $this->buildUnresolvedRow($row);
                $outcomes[$key] = [
                    'resolved' => false,
                    'qty' => (int) ($row['qty'] ?? 0),
                    'supplier_price' => (float) ($row['supplier_price'] ?? 0),
                    'code' => $row['code'] ?? '',
                    'title' => $row['title'] ?? '',
                    'unresolved' => $unresolvedRow,
                ];
                $batchUnresolved[] = $unresolvedRow;
            }
        }

        Storage::disk(self::IMPORT_SESSION_DISK)->put(
            $dir . '/outcomes.json',
            json_encode($outcomes, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)
        );

        $nextOffset = $offset + $limit;

        return [
            'next_offset' => $nextOffset,
            'total_rows' => $total,
            'done' => $nextOffset >= $total,
            'unresolved' => $batchUnresolved,
        ];
    }

    /**
     * Добавляет в черновик прихода только вновь сопоставленные строки (остальные остаются в сессии).
     * Повторные вызовы добавляют строки в тот же черновик, пока не сброена привязка в meta.
     *
     * @return array{
     *     receipt: StockReceipt,
     *     committed_map_keys: list<string>,
     *     committed_rows_count: int,
     *     created_new_receipt: bool
     * }
     */
    public function commitImportSession(string $sessionId, array $payload): array
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(300);
        }

        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $dir = $this->sessionDir($sessionId);
        $this->assertSessionOwned($dir, (int) $userId);

        $aggregated = $this->readSessionJson($dir . '/aggregated.json');
        $outcomes = $this->readSessionJson($dir . '/outcomes.json');
        if (!is_array($outcomes)) {
            $outcomes = [];
        }

        $expectedKeys = [];
        foreach ($aggregated as $row) {
            $k = trim((string) ($row['map_key'] ?? ''));
            if ($k !== '') {
                $expectedKeys[$k] = true;
            }
        }

        foreach (array_keys($expectedKeys) as $mapKey) {
            if (!array_key_exists($mapKey, $outcomes)) {
                throw new HttpResponseException(
                    response()->json([
                        'message' => 'Сессия импорта неполная: сначала дождись окончания разбора по пакетам.',
                        'unresolved' => [],
                        'unresolved_count' => 0,
                        'mapping_required' => false,
                    ], 422)
                );
            }
        }

        $meta = $this->readSessionMeta($dir);
        $committedKeys = $meta['committed_map_keys'] ?? [];
        if (!is_array($committedKeys)) {
            $committedKeys = [];
        }
        $committedKeys = array_values(array_unique(array_map('strval', $committedKeys)));
        $committedSet = array_fill_keys($committedKeys, true);

        $mappingIndex = $this->buildMappingIndex($payload['mapping'] ?? []);
        $restrictToMappedKeysOnly = $this->mappingPayloadHasVariants($payload['mapping'] ?? []);

        $items = [];
        $rowsForMappings = [];
        $newlyCommittedKeys = [];

        foreach ($aggregated as $row) {
            $key = trim((string) ($row['map_key'] ?? ''));
            if ($key === '' || isset($committedSet[$key])) {
                continue;
            }

            $o = $outcomes[$key];

            if ($restrictToMappedKeysOnly && !array_key_exists($key, $mappingIndex)) {
                continue;
            }

            $variantId = (int) ($mappingIndex[$key] ?? 0);
            if ($variantId <= 0 && !$restrictToMappedKeysOnly) {
                if (!empty($o['resolved'])) {
                    $variantId = (int) ($o['variant_id'] ?? 0);
                }
            }

            if ($variantId <= 0) {
                continue;
            }

            $variant = ProductVariantLink::query()->find($variantId);
            if (!$variant) {
                continue;
            }

            $items[] = [
                'product_id' => (int) $variant->product_id,
                'variant_id' => $variantId,
                'qty' => (int) ($row['qty'] ?? 0),
                'supplier_price' => (float) ($row['supplier_price'] ?? 0),
                'supplier_sku' => ($row['code'] ?? '') !== '' ? (string) $row['code'] : null,
            ];
            $rowsForMappings[] = $row;
            $newlyCommittedKeys[] = $key;
        }

        if ($items === []) {
            abort(422, 'Нет строк для добавления: сопоставьте хотя бы одну новую позицию (ещё не попавшую в текущий приход).');
        }

        $this->storeMappings($rowsForMappings, $mappingIndex);

        $warehouseId = (int) ($payload['warehouse_id'] ?? $this->inventoryService->getDefaultSupplierWarehouseId());
        $targetReceiptId = isset($meta['target_stock_receipt_id']) ? (int) $meta['target_stock_receipt_id'] : 0;
        $createdNew = false;

        if ($targetReceiptId > 0) {
            $receipt = StockReceipt::query()->findOrFail($targetReceiptId);
            if ($receipt->status !== StockReceipt::STATUS_DRAFT) {
                abort(422, 'Документ прихода уже оприходован. Начни новый импорт или сбрось привязку к документу в сессии.');
            }
            $payloadWarehouse = (int) ($payload['warehouse_id'] ?? 0);
            if ($payloadWarehouse > 0 && $payloadWarehouse !== (int) $receipt->warehouse_id) {
                abort(422, 'Склад в форме не совпадает со складом выбранного прихода');
            }
            $receipt = $this->receiptService->appendDraftItems($receipt, $items);
        } else {
            $receipt = $this->receiptService->store([
                'warehouse_id' => $warehouseId,
                'supplier_id' => $payload['supplier_id'] ?? null,
                'supplier_code' => $payload['supplier_code'] ?? null,
                'supplier_name' => trim((string) ($payload['supplier_name'] ?? 'XLS import')),
                'received_at' => $payload['received_at'] ?? now()->toDateTimeString(),
                'comment' => $payload['comment'] ?? 'Импорт прихода из XLS',
                'items' => $items,
            ]);
            $createdNew = true;
            $meta['target_stock_receipt_id'] = $receipt->id;
        }

        foreach ($newlyCommittedKeys as $k) {
            $committedSet[$k] = true;
        }
        $meta['committed_map_keys'] = array_keys($committedSet);
        $this->writeSessionMeta($dir, $meta);

        return [
            'receipt' => $receipt,
            'committed_map_keys' => $newlyCommittedKeys,
            'committed_rows_count' => count($newlyCommittedKeys),
            'created_new_receipt' => $createdNew,
        ];
    }

    /**
     * Сброс привязки сессии к черновику прихода (следующий commit создаст новый документ).
     */
    public function clearImportSessionReceiptTarget(string $sessionId): void
    {
        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Требуется авторизация');
        }

        $dir = $this->sessionDir($sessionId);
        $this->assertSessionOwned($dir, (int) $userId);

        $meta = $this->readSessionMeta($dir);
        $meta['target_stock_receipt_id'] = null;
        $this->writeSessionMeta($dir, $meta);
    }

    /**
     * @return array<string, mixed>
     */
    private function readSessionMeta(string $dir): array
    {
        $metaPath = $dir . '/meta.json';
        if (!Storage::disk(self::IMPORT_SESSION_DISK)->exists($metaPath)) {
            abort(404, 'Сессия импорта не найдена или устарела');
        }

        $raw = Storage::disk(self::IMPORT_SESSION_DISK)->get($metaPath);
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    private function writeSessionMeta(string $dir, array $meta): void
    {
        Storage::disk(self::IMPORT_SESSION_DISK)->put(
            $dir . '/meta.json',
            json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)
        );
    }

    private function sessionDir(string $sessionId): string
    {
        if (!Str::isUuid($sessionId)) {
            abort(422, 'Некорректный session_id');
        }

        return self::IMPORT_SESSION_PREFIX . '/' . $sessionId;
    }

    /**
     * @return array<mixed>
     */
    private function readSessionJson(string $relativePath): array
    {
        if (!Storage::disk(self::IMPORT_SESSION_DISK)->exists($relativePath)) {
            abort(404, 'Файл сессии импорта не найден');
        }

        $raw = Storage::disk(self::IMPORT_SESSION_DISK)->get($relativePath);
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            abort(422, 'Повреждённые данные сессии импорта');
        }

        return $decoded;
    }

    private function assertSessionOwned(string $dir, int $userId): void
    {
        $metaPath = $dir . '/meta.json';
        if (!Storage::disk(self::IMPORT_SESSION_DISK)->exists($metaPath)) {
            abort(404, 'Сессия импорта не найдена или устарела');
        }

        $meta = json_decode(Storage::disk(self::IMPORT_SESSION_DISK)->get($metaPath), true);
        if (!is_array($meta) || (int) ($meta['user_id'] ?? 0) !== $userId) {
            abort(403, 'Нет доступа к этой сессии импорта');
        }
    }

    /**
     * @return array{product_id: int, variant_id: int}|null
     */
    private function tryResolveAggregatedRow(array $row, array $mappingIndex): ?array
    {
        $resolved = $this->resolveVariant($row['code'] ?? '', $row['title'] ?? '');
        if (!$resolved) {
            $resolved = $this->resolveVariantFromMapping($row, $mappingIndex);
        }
        if (!$resolved) {
            $resolved = $this->resolveVariantFromStoredMapping($row);
        }

        return $resolved;
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
        $grouped = [];

        foreach ($rows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            $title = trim((string) ($row['title'] ?? ''));
            $normalizedTitle = $this->normalizeExactTitle($title);
            $key = $code !== ''
                ? "sku:{$code}"
                : 'title:' . $normalizedTitle;

            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'code' => $code,
                    'title' => $title,
                    'supplier_price' => $row['supplier_price'],
                    'qty' => 0,
                    'map_key' => $key,
                ];
            }

            $grouped[$key]['qty'] += (int) ($row['qty'] ?? 0);
            if (($row['supplier_price'] ?? null) !== null) {
                $grouped[$key]['supplier_price'] = $row['supplier_price'];
            }
        }

        return array_values($grouped);
    }

    private function resolveVariant(string $code, string $title): ?array
    {
        // 1) Основной путь: сопоставление по названию (после дедупа в XLS).
        $titleCandidates = $this->buildTitleCandidates($title);
        if (empty($titleCandidates)) {
            return null;
        }

        $offerByName = SupplierVariantOffer::query()
            ->with('productVariant')
            ->where(function ($query) use ($titleCandidates) {
                foreach ($titleCandidates as $normalizedTitle) {
                    $query
                        ->orWhereRaw('LOWER(TRIM(COALESCE(external_product_name, ""))) = ?', [$normalizedTitle])
                        ->orWhereRaw('LOWER(TRIM(COALESCE(external_variant_name, ""))) = ?', [$normalizedTitle])
                        ->orWhereRaw('LOWER(TRIM(CONCAT(COALESCE(external_product_name, ""), " ", COALESCE(external_variant_name, "")))) = ?', [$normalizedTitle]);
                }
            })
            ->orderByDesc('is_active')
            ->orderByDesc('id')
            ->first();
        if ($offerByName?->productVariant) {
            return [
                'product_id' => (int) $offerByName->productVariant->product_id,
                'variant_id' => (int) $offerByName->productVariant->id,
            ];
        }

        $variantId = null;
        foreach ($titleCandidates as $normalizedTitle) {
            $variantId = DB::table('product_variant_links as pvl')
                ->join('products as p', 'p.id', '=', 'pvl.product_id')
                ->leftJoin('brands as b', 'b.id', '=', 'p.brand_id')
                ->join('variant_definitions as vd', 'vd.id', '=', 'pvl.variant_definition_id')
                ->where(function ($query) use ($normalizedTitle): void {
                    $query
                        ->whereRaw(
                            'LOWER(TRIM(CONCAT_WS(" ", NULLIF(TRIM(b.name), ""), TRIM(p.name), TRIM(vd.title)))) = ?',
                            [$normalizedTitle]
                        )
                        ->orWhereRaw(
                            'LOWER(TRIM(CONCAT(TRIM(p.name), " ", TRIM(vd.title)))) = ?',
                            [$normalizedTitle]
                        );
                })
                ->value('pvl.id');
            if ($variantId) {
                break;
            }
        }

        if ($variantId) {
            $variant = ProductVariantLink::query()->find((int) $variantId);
            if ($variant) {
                return [
                    'product_id' => (int) $variant->product_id,
                    'variant_id' => (int) $variant->id,
                ];
            }
        }

        // 2) Фолбек: если код есть и в офферах он все-таки заведен — пробуем матч по коду.
        if ($code !== '') {
            $codeCandidates = $this->buildCodeCandidates($code);
            $offerByCode = SupplierVariantOffer::query()
                ->with('productVariant')
                ->where(function ($query) use ($codeCandidates) {
                    $query
                        ->whereIn('external_id', $codeCandidates)
                        ->orWhereIn('sku', $codeCandidates);
                })
                ->orderByDesc('is_active')
                ->orderByDesc('id')
                ->first();

            if ($offerByCode?->productVariant) {
                return [
                    'product_id' => (int) $offerByCode->productVariant->product_id,
                    'variant_id' => (int) $offerByCode->productVariant->id,
                ];
            }
        }

        // 3) Fuzzy fallback по правилам парсера из SupplierPriceImportService.
        $matchedByParser = $this->resolveVariantByMatcher($code, $title);
        if ($matchedByParser) {
            return $matchedByParser;
        }

        return null;
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

    private function buildTitleCandidates(string $title): array
    {
        $base = $this->normalizeExactTitle($title);
        if ($base === '') {
            return [];
        }

        $candidates = [$base];
        foreach (self::TITLE_BRAND_ALIASES as $pattern => $replacement) {
            $aliased = preg_replace($pattern, $replacement, $base);
            if (is_string($aliased) && $aliased !== '') {
                $candidates[] = $this->normalizeExactTitle($aliased);
            }
        }

        return array_values(array_unique($candidates));
    }

    private function buildCodeCandidates(string $code): array
    {
        $raw = trim($code);
        if ($raw === '') {
            return [];
        }

        $candidates = [$raw];
        $noSpaces = preg_replace('/\s+/u', '', $raw) ?? $raw;
        $candidates[] = $noSpaces;

        if (preg_match('/^\d+(\.0+)?$/', $noSpaces) === 1) {
            $intCode = (string) (int) ((float) $noSpaces);
            $candidates[] = $intCode;
            $candidates[] = ltrim($intCode, '0');
        }

        $normalized = array_values(array_unique(array_filter($candidates, static function ($value) {
            return is_string($value) && $value !== '';
        })));

        return $normalized;
    }

    private function resolveVariantByMatcher(string $code, string $title): ?array
    {
        foreach ($this->buildMatcherTitleCandidates($title) as $titleCandidate) {
            $parsed = $this->variantMatcher->parseSupplierRow(
                [
                    'code' => $code,
                    'title' => $titleCandidate,
                    'supplier_price' => null,
                ],
                $this->getBrands(),
                $this->getMatchRules(),
                $this->getProductsIndex()
            );

            $variantId = (int) ($parsed['selected_variant_id'] ?? 0);
            if ($variantId <= 0) {
                continue;
            }

            $variant = ProductVariantLink::query()->find($variantId);
            if (!$variant) {
                continue;
            }

            return [
                'product_id' => (int) $variant->product_id,
                'variant_id' => (int) $variant->id,
            ];
        }

        return null;
    }

    private function buildMatcherTitleCandidates(string $title): array
    {
        $raw = trim($title);
        if ($raw === '') {
            return [];
        }

        $candidates = [$raw];
        foreach (self::TITLE_BRAND_ALIASES as $pattern => $replacement) {
            $aliased = preg_replace($pattern, $replacement, $raw);
            if (is_string($aliased) && trim($aliased) !== '') {
                $candidates[] = trim($aliased);
            }
        }

        return array_values(array_unique($candidates));
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
            $this->matchRules = SellerOneMatchRule::query()
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
        if ($this->productsIndex === null) {
            $products = Product::query()
                ->with([
                    'brand',
                    'variants.definition',
                    'attributeValues.productAttribute:id,name',
                    'attributeValues.selectedOptions.productAttributeOption:id,name',
                ])
                ->get();

            $grouped = [];
            foreach ($products as $product) {
                if (!$product->brand_id) {
                    continue;
                }
                $grouped[$product->brand_id][] = $product;
            }

            $this->productsIndex = $grouped;
        }

        return $this->productsIndex;
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

    private function buildUnresolvedRow(array $row): array
    {
        $code = trim((string) ($row['code'] ?? ''));
        $title = trim((string) ($row['title'] ?? ''));
        $mapKey = trim((string) ($row['map_key'] ?? ($code !== '' ? 'sku:' . $code : 'title:' . $this->normalizeExactTitle($title))));

        $parsed = $this->variantMatcher->parseSupplierRow(
            [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $row['supplier_price'] ?? null,
            ],
            $this->getBrands(),
            $this->getMatchRules(),
            $this->getProductsIndex()
        );

        return [
            'map_key' => $mapKey,
            'code' => $code,
            'title' => $title,
            'supplier_price' => $row['supplier_price'] ?? null,
            'qty' => (int) ($row['qty'] ?? 0),
            'parsed' => $parsed['parsed'] ?? null,
            'suggested_variant' => $parsed['suggested_variant'] ?? null,
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
