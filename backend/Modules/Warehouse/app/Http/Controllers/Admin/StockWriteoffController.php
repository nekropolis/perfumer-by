<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Models\StockWriteoffItem;
use Modules\Warehouse\Services\StockInventoryService;

class StockWriteoffController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $type = trim((string) $request->input('type', ''));
        $warehouseId = (int) $request->input('warehouse_id', 0);
        $dateFrom = trim((string) $request->input('date_from', ''));
        $dateTo = trim((string) $request->input('date_to', ''));

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
            ->when($type !== '', function ($query) use ($type) {
                if ($type === 'writeoff') {
                    $query->whereIn('type', ['order', 'manual']);

                    return;
                }

                $query->where('type', $type);
            })
            ->when($warehouseId > 0, fn ($query) => $query->where('warehouse_id', $warehouseId))
            ->when($dateFrom !== '', fn ($query) => $query->whereDate('written_off_at', '>=', $dateFrom))
            ->when($dateTo !== '', fn ($query) => $query->whereDate('written_off_at', '<=', $dateTo))
            ->orderByDesc('id')
            ->paginate(20);

        return response()->json($writeoffs);
    }

    public function show(int $id, StockInventoryService $inventoryService): JsonResponse
    {
        $writeoff = StockWriteoff::query()
            ->with(['warehouse', 'items.variant.definition', 'items.product.brand'])
            ->findOrFail($id);

        if ($writeoff->type === 'reserve' && $writeoff->order_id && $writeoff->items->isEmpty()) {
            if ($inventoryService->backfillOrderReserveDocumentItems($writeoff)) {
                $writeoff->load(['items.variant.definition', 'items.product.brand']);
            }
        }

        $this->enrichWriteoffItemLabels($writeoff);

        return response()->json([
            'data' => $writeoff,
            'can_reverse' => $inventoryService->canReverseWriteoff($writeoff),
            'can_write_off' => $writeoff->type === 'reserve'
                && $writeoff->order_id === null
                && $writeoff->status === StockWriteoff::STATUS_POSTED
                && $writeoff->items->isNotEmpty(),
        ]);
    }

    public function reverse(int $id, StockInventoryService $service): JsonResponse
    {
        $writeoff = $service->reverseWriteoff($id);
        $this->enrichWriteoffItemLabels($writeoff);

        return response()->json([
            'message' => 'Списание отменено, остатки на физических складах восстановлены',
            'data' => $writeoff,
        ]);
    }

    public function writeOff(int $id, StockInventoryService $service): JsonResponse
    {
        $writeoff = $service->writeOffManualReserve($id);
        $this->enrichWriteoffItemLabels($writeoff);

        return response()->json([
            'message' => 'Резерв списан',
            'data' => $writeoff,
        ], 201);
    }

    public function store(Request $request, StockInventoryService $service): JsonResponse
    {
        $validated = $request->validate([
            'document_kind' => ['nullable', 'string', 'in:writeoff,reserve'],
            'written_off_at' => ['nullable', 'date'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'comment' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.variant_id' => ['required', 'integer', 'exists:product_variant_links,id'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.price' => ['nullable', 'numeric', 'min:0'],
            'items.*.payload' => ['nullable', 'array'],
            'items.*.stock_source' => ['nullable', 'string', 'in:available,reserved'],
            'items.*.stock_lot_id' => ['nullable', 'integer', 'min:1'],
            'items.*.stock_lot_allocations' => ['nullable', 'array'],
            'items.*.stock_lot_allocations.*.lot_id' => ['required_with:items.*.stock_lot_allocations', 'integer', 'min:1'],
            'items.*.stock_lot_allocations.*.qty' => ['required_with:items.*.stock_lot_allocations', 'integer', 'min:1'],
        ]);

        $documentKind = (string) ($validated['document_kind'] ?? 'writeoff');
        $writeoff = $documentKind === 'reserve'
            ? $service->createManualReserve($validated)
            : $service->createManualWriteoff($validated);

        $writeoff->load(['warehouse', 'items.variant.definition', 'items.product.brand']);
        $this->enrichWriteoffItemLabels($writeoff);

        return response()->json([
            'message' => $documentKind === 'reserve' ? 'Резерв создан' : 'Списание создано',
            'data' => $writeoff,
        ], 201);
    }

    private function enrichWriteoffItemLabels(StockWriteoff $writeoff): void
    {
        $writeoff->loadMissing(['items.variant.definition', 'items.product.brand']);

        foreach ($writeoff->items as $item) {
            if (! $item instanceof StockWriteoffItem) {
                continue;
            }

            $variantTitle = trim((string) $item->variant_title);
            if ($variantTitle === '' && $item->variant) {
                $item->setAttribute('variant_title', trim((string) $item->variant->title));
            }

            // Snapshot из заказа часто без бренда («King of Seduction Absolute»).
            // Для отображения всегда каноническое «бренд + имя» из каталога.
            if ($item->product) {
                $canonical = ProductDisplayName::forProduct($item->product);
                if ($canonical !== '') {
                    $item->setAttribute('product_name', $canonical);
                }
            }
        }
    }
}