<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Supplier;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptImportSessionState;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Services\StockReceiptService;
use Modules\Warehouse\Services\StockReceiptXlsImportService;

class StockReceiptController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $warehouseId = (int) $request->input('warehouse_id', 0);

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
            'session_id' => ['required', 'uuid'],
            'offset' => ['required', 'integer', 'min:0'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:150'],
        ]);

        $result = $service->resolveImportBatch(
            $validated['session_id'],
            (int) $validated['offset'],
            (int) ($validated['limit'] ?? 75)
        );

        return response()->json($result);
    }

    public function importXlsCommit(Request $request, StockReceiptXlsImportService $service): JsonResponse
    {
        $validated = $request->validate([
            'session_id' => ['required', 'uuid'],
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

        $sessionId = $validated['session_id'];
        unset($validated['session_id']);

        $result = $service->commitImportSession($sessionId, $validated);
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
            'session_id' => ['required', 'uuid'],
        ]);

        $service->clearImportSessionReceiptTarget($validated['session_id']);

        return response()->json([
            'message' => 'Следующее сохранение создаст новый черновик прихода',
        ]);
    }

    public function importXlsState(Request $request): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        abort_if($userId <= 0, 401, 'Требуется авторизация');

        $state = StockReceiptImportSessionState::query()
            ->where('user_id', $userId)
            ->latest('updated_at')
            ->first();

        return response()->json([
            'data' => $state,
        ]);
    }

    public function importXlsStateSave(Request $request): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        abort_if($userId <= 0, 401, 'Требуется авторизация');

        $validated = $request->validate([
            'session_id' => ['nullable', 'uuid'],
            'warehouse_id' => ['nullable', 'integer'],
            'supplier_id' => ['nullable', 'integer'],
            'received_at' => ['nullable', 'string', 'max:40'],
            'comment' => ['nullable', 'string', 'max:500'],
            'parsed_total_rows' => ['nullable', 'integer', 'min:0'],
            'linked_draft_receipt_id' => ['nullable', 'integer'],
            'unresolved' => ['nullable', 'array'],
            'mapping_by_key' => ['nullable', 'array'],
        ]);

        StockReceiptImportSessionState::query()->updateOrCreate(
            ['user_id' => $userId],
            [
                'session_id' => $validated['session_id'] ?? null,
                'warehouse_id' => $validated['warehouse_id'] ?? null,
                'supplier_id' => $validated['supplier_id'] ?? null,
                'received_at' => $validated['received_at'] ?? null,
                'comment' => $validated['comment'] ?? null,
                'parsed_total_rows' => $validated['parsed_total_rows'] ?? null,
                'linked_draft_receipt_id' => $validated['linked_draft_receipt_id'] ?? null,
                'unresolved' => $validated['unresolved'] ?? [],
                'mapping_by_key' => $validated['mapping_by_key'] ?? [],
            ]
        );

        return response()->json([
            'message' => 'Состояние импорта сохранено',
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

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
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
            'items.*.variant_definition.volume_ml' => ['required_with:items.*.variant_definition', 'integer', 'min:1'],
            'items.*.variant_definition.concentration_code' => ['required_with:items.*.variant_definition', 'string', 'max:50'],
            'items.*.variant_definition.concentration_label' => ['required_with:items.*.variant_definition', 'string', 'max:120'],
            'items.*.variant_definition.is_tester' => ['nullable', 'boolean'],
        ]);
    }
}
