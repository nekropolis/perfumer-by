<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Supplier;
use Modules\Warehouse\Models\StockReceipt;
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
            'message' => 'Приход создан',
            'data' => $receipt,
        ], 201);
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
            'message' => 'Приход из XLS создан',
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
