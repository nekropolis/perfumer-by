<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptImport;
use Modules\Warehouse\Models\StockReceiptImportMapping;
use Modules\Warehouse\Models\StockReceiptItem;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Services\StockReceiptService;
use Modules\Warehouse\Services\StockReceiptXlsImportService;

class StockReceiptController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $warehouseId = (int) $request->input('warehouse_id', 0);
        $supplierId = (int) $request->input('supplier_id', 0);
        $status = trim((string) $request->input('status', ''));

        $receipts = StockReceipt::query()
            ->with(['supplier', 'warehouse', 'items'])
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($subQuery) use ($search) {
                    $subQuery->where('document_no', 'like', "%{$search}%")
                        ->orWhere('supplier_name', 'like', "%{$search}%")
                        ->orWhere('supplier_code', 'like', "%{$search}%");
                });
            })
            ->when($warehouseId > 0, fn ($query) => $query->where('warehouse_id', $warehouseId))
            ->when($supplierId > 0, fn ($query) => $query->where('supplier_id', $supplierId))
            ->when(
                $status !== '' && in_array($status, [StockReceipt::STATUS_DRAFT, StockReceipt::STATUS_POSTED], true),
                fn ($query) => $query->where('status', $status)
            )
            ->orderByDesc('id')
            ->paginate(20);

        return response()->json($receipts);
    }

    public function show(int $id): JsonResponse
    {
        $receipt = StockReceipt::query()
            ->with(['supplier', 'warehouse', 'items.variant.definition'])
            ->findOrFail($id);

        return response()->json([
            'data' => $receipt,
        ]);
    }

    public function store(Request $request, StockReceiptService $service): JsonResponse
    {
        $receipt = $service->store($this->validatePayload($request));

        return response()->json([
            'message' => 'Черновик прихода создан',
            'data' => $receipt,
        ], 201);
    }

    public function importXlsPrepare(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:xls,xlsx'],
        ]);

        $result = $service->prepareImportSession($request->file('file'));

        return response()->json($result);
    }

    public function importXlsResolveBatch(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'import_id' => ['required', 'uuid'],
            'offset' => ['nullable', 'integer', 'min:0'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:150'],
        ]);

        try {
            $result = $service->resolveImportBatch(
                $validated['import_id'],
                (int) ($validated['offset'] ?? 0),
                (int) ($validated['limit'] ?? 75)
            );
        } catch (\Throwable $e) {
            Log::error('Stock receipt XLS resolve-batch failed', [
                'import_id' => $validated['import_id'],
                'offset' => $validated['offset'] ?? 0,
                'limit' => $validated['limit'] ?? 75,
                'exception' => $e,
            ]);

            throw $e;
        }

        return response()->json($result);
    }

    public function importXlsCommit(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'import_id' => ['required', 'uuid'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'supplier_code' => ['nullable', 'string', 'max:100'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'received_at' => ['nullable', 'date'],
            'comment' => ['nullable', 'string'],
            'mapping' => ['nullable', 'array'],
            'mapping.*.map_key' => ['nullable', 'string', 'max:255'],
            'mapping.*.code' => ['nullable', 'string', 'max:100'],
            'mapping.*.title' => ['nullable', 'string', 'max:255'],
            'mapping.*.variant_id' => ['nullable', 'integer', 'exists:product_variant_links,id'],
            'mapping.*.selected_variant_id' => ['nullable', 'integer', 'exists:product_variant_links,id'],
        ]);

        $importId = $validated['import_id'];
        unset($validated['import_id']);

        $result = $service->commitImportSession($importId, $validated);
        $status = $result['created_new_receipt'] ? 201 : 200;

        return response()->json([
            'message' => $result['created_new_receipt']
                ? 'Создан черновик прихода, строки добавлены'
                : 'Строки добавлены в приход',
            'data' => $result['receipt'],
            'committed_map_keys' => $result['committed_map_keys'],
            'committed_rows_count' => $result['committed_rows_count'],
            'created_new_receipt' => $result['created_new_receipt'],
        ], $status);
    }

    public function importXlsClearReceipt(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'import_id' => ['required', 'uuid'],
        ]);

        $service->clearImportSessionReceiptTarget($validated['import_id']);

        return response()->json([
            'message' => 'Следующее сохранение создаст новый черновик прихода',
        ]);
    }

    public function importXlsShow(string $importId, StockReceiptXlsImportService $service): JsonResponse
    {
        return response()->json([
            'data' => $service->getImport($importId),
        ]);
    }

    public function importXlsLink(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'import_id' => ['required', 'uuid'],
            'map_key' => ['required', 'string', 'max:255'],
            'variant_id' => ['required', 'integer', 'exists:product_variant_links,id'],
        ]);

        $row = $service->linkImportRow($validated['import_id'], $validated);

        return response()->json([
            'message' => 'Связка сохранена',
            'data' => $row,
        ]);
    }

    public function importXlsClose(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'import_id' => ['required', 'uuid'],
        ]);

        $service->closeImport($validated['import_id']);

        return response()->json([
            'message' => 'Импорт закрыт',
        ]);
    }

    public function importXlsState(StockReceiptXlsImportService $service): JsonResponse
    {
        return response()->json($service->getLatestOpenImportState());
    }

    public function importXlsStateSave(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'import_id' => ['required', 'uuid'],
            'warehouse_id' => ['nullable', 'integer'],
            'supplier_id' => ['nullable', 'integer'],
            'received_at' => ['nullable', 'string', 'max:40'],
            'comment' => ['nullable', 'string', 'max:500'],
        ]);

        $model = StockReceiptImport::query()
            ->where('uuid', $validated['import_id'])
            ->where('status', StockReceiptImport::STATUS_OPEN)
            ->firstOrFail();

        $model->warehouse_id = $validated['warehouse_id'] ?? $model->warehouse_id;
        $model->supplier_id = array_key_exists('supplier_id', $validated)
            ? $validated['supplier_id']
            : $model->supplier_id;
        if (!empty($validated['received_at'])) {
            $model->received_at = $validated['received_at'];
        }
        if (array_key_exists('comment', $validated)) {
            $model->comment = $validated['comment'];
        }
        $model->save();

        return response()->json([
            'message' => 'Параметры импорта сохранены',
            'data' => $service->getImport($validated['import_id']),
        ]);
    }

    public function postReceipt(int $id, StockReceiptService $service): JsonResponse
    {
        $receipt = StockReceipt::query()->findOrFail($id);
        $receipt = $service->post($receipt);

        return response()->json([
            'message' => 'Приход оприходован',
            'data' => $receipt,
        ]);
    }

    public function importXls(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:xls,xlsx'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'supplier_code' => ['nullable', 'string', 'max:100'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'received_at' => ['nullable', 'date'],
            'comment' => ['nullable', 'string'],
            'mapping' => ['nullable', 'array'],
            'mapping.*.map_key' => ['nullable', 'string', 'max:255'],
            'mapping.*.code' => ['nullable', 'string', 'max:100'],
            'mapping.*.title' => ['nullable', 'string', 'max:255'],
            'mapping.*.variant_id' => ['nullable', 'integer', 'exists:product_variant_links,id'],
            'mapping.*.selected_variant_id' => ['nullable', 'integer', 'exists:product_variant_links,id'],
        ]);

        $receipt = $service->import($request->file('file'), $validated);

        return response()->json([
            'message' => 'Черновик прихода из XLS создан',
            'data' => $receipt,
        ], 201);
    }

    public function update(Request $request, int $id, StockReceiptService $service): JsonResponse
    {
        $receipt = StockReceipt::query()->findOrFail($id);
        $receipt = $service->update($receipt, $this->validatePayload($request));

        return response()->json([
            'message' => 'Приход обновлен',
            'data' => $receipt,
        ]);
    }

    public function destroy(int $id, StockReceiptService $service): JsonResponse
    {
        $receipt = StockReceipt::query()->findOrFail($id);
        $service->destroy($receipt);

        return response()->json([
            'message' => 'Приход удален',
        ]);
    }

    public function suppliers(): JsonResponse
    {
        $items = Supplier::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        return response()->json([
            'data' => $items,
        ]);
    }

    public function warehouses(): JsonResponse
    {
        $items = Warehouse::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'is_default']);

        return response()->json([
            'data' => $items,
        ]);
    }

    public function lookupBySku(Request $request): JsonResponse
    {
        $code = trim((string) $request->input('code', ''));
        $supplierId = (int) $request->input('supplier_id', 0);

        if ($code === '') {
            return response()->json([
                'data' => [
                    'supplier_product_name' => null,
                    'supplier_price' => null,
                ],
            ]);
        }

        $name = null;
        $price = null;

        $receiptItemQuery = StockReceiptItem::query()
            ->with(['receipt'])
            ->where('supplier_sku', $code)
            ->orderByDesc('id');

        if ($supplierId > 0) {
            $receiptItemQuery->whereHas('receipt', function ($query) use ($supplierId) {
                $query->where('supplier_id', $supplierId);
            });
        }

        $receiptItem = $receiptItemQuery->first();
        if ($receiptItem) {
            $payload = is_array($receiptItem->payload) ? $receiptItem->payload : [];
            $name = trim((string) (
                $payload['supplier_product_name']
                ?? $payload['title']
                ?? $payload['name']
                ?? ''
            ));
            $name = $name !== '' ? $name : null;
            $price = $receiptItem->supplier_price;
        }

        if ($name === null) {
            $mapping = StockReceiptImportMapping::query()
                ->where('supplier_sku', $code)
                ->whereNotNull('source_title')
                ->orderByDesc('id')
                ->first();

            if ($mapping) {
                $mappedTitle = trim((string) ($mapping->source_title ?? ''));
                $name = $mappedTitle !== '' ? $mappedTitle : null;
            }
        }

        if ($name === null || $price === null) {
            $offerQuery = SupplierVariantOffer::query()
                ->where(function ($query) use ($code) {
                    $query->where('external_id', $code)
                        ->orWhere('sku', $code);
                })
                ->orderByDesc('id');

            if ($supplierId > 0) {
                $offerQuery->where('supplier_id', $supplierId);
            }

            $offer = $offerQuery->first();
            if ($offer) {
                $payload = is_array($offer->payload) ? $offer->payload : [];
                if ($name === null) {
                    $offerName = trim((string) (
                        $payload['supplier_product_name']
                        ?? $payload['title']
                        ?? $offer->external_product_name
                        ?? $offer->external_variant_name
                        ?? ''
                    ));
                    $name = $offerName !== '' ? $offerName : null;
                }
                if ($price === null) {
                    $price = $payload['supplier_price'] ?? $offer->purchase_price;
                }
            }
        }

        return response()->json([
            'data' => [
                'supplier_product_name' => $name,
                'supplier_price' => $price,
            ],
        ]);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'supplier_code' => ['nullable', 'string', 'max:100'],
            'supplier_name' => ['required', 'string', 'max:255'],
            'received_at' => ['nullable', 'date'],
            'comment' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.variant_id' => ['nullable', 'integer', 'exists:product_variant_links,id'],
            'items.*.variant_definition_id' => ['nullable', 'integer', 'exists:variant_definitions,id'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.supplier_price' => ['required', 'numeric', 'min:0'],
            'items.*.supplier_sku' => ['nullable', 'string', 'max:100'],
            'items.*.payload' => ['nullable', 'array'],
            'items.*.variant_definition' => ['nullable', 'array'],
            'items.*.variant_definition.volume_ml' => ['required_with:items.*.variant_definition', 'numeric', 'min:0.1', 'max:99999'],
            'items.*.variant_definition.concentration_code' => ['required_with:items.*.variant_definition', 'string', 'max:50'],
            'items.*.variant_definition.concentration_label' => ['required_with:items.*.variant_definition', 'string', 'max:120'],
            'items.*.variant_definition.is_tester' => ['nullable', 'boolean'],
            'items.*.variant_definition.is_vial' => ['nullable', 'boolean'],
        ]);
    }
}
