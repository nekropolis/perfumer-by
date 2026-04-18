<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Services\StockInventoryService;

class StockWriteoffController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $type = trim((string) $request->input('type', ''));
        $warehouseId = (int) $request->input('warehouse_id', 0);

        $writeoffs = StockWriteoff::query()
            ->with(['warehouse', 'items'])
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($subQuery) use ($search) {
                    $subQuery->where('document_no', 'like', "%{$search}%")
                        ->orWhere('comment', 'like', "%{$search}%");

                    if (is_numeric($search)) {
                        $subQuery->orWhere('order_id', (int) $search);
                    }
                });
            })
            ->when($type !== '', fn ($query) => $query->where('type', $type))
            ->when($warehouseId > 0, fn ($query) => $query->where('warehouse_id', $warehouseId))
            ->orderByDesc('id')
            ->paginate(20);

        return response()->json($writeoffs);
    }

    public function show(int $id): JsonResponse
    {
        $writeoff = StockWriteoff::query()
            ->with(['warehouse', 'items.variant.definition'])
            ->findOrFail($id);

        return response()->json([
            'data' => $writeoff,
        ]);
    }

    public function store(Request $request, StockInventoryService $service): JsonResponse
    {
        $validated = $request->validate([
            'written_off_at' => ['nullable', 'date'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'comment' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.variant_id' => ['required', 'integer', 'exists:product_variant_links,id'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.price' => ['nullable', 'numeric', 'min:0'],
            'items.*.payload' => ['nullable', 'array'],
        ]);

        $writeoff = $service->createManualWriteoff($validated);

        return response()->json([
            'message' => 'Списание создано',
            'data' => $writeoff,
        ], 201);
    }
}
