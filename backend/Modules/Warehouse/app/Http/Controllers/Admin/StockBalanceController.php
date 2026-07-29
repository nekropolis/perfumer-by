<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Warehouse\Models\WarehouseStockLot;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Modules\Warehouse\Services\StockLotService;
use Modules\Warehouse\Services\WholesalePriceService;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockBalanceController extends Controller
{
    public function __construct(
        private readonly WholesalePriceService $wholesalePriceService,
        private readonly StockLotService $stockLotService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $stockState = trim((string) $request->input('stock_state', ''));
        $warehouseId = (int) $request->input('warehouse_id', 0);
        $perPage = (int) $request->input('per_page', 25);
        // 2000 ≈ «показать все» для админ-отчёта; выше — риск тяжёлого ответа/рендера.
        if (!in_array($perPage, [25, 50, 100, 2000], true)) {
            $perPage = 25;
        }

        $query = WarehouseVariantStock::query()
            ->with(['warehouse', 'product.brand', 'variant.definition']);

        // Строка склада с 0 остатком и 0 резервом часто — артефакт `getWarehouseStock()`:
        // при первом lock/резерве/движении создаётся пустая запись на этом складе+варианте.
        // В отчёте «Остатки» такие строки путают (кажется, вариант «лежит» на основном).
        // Показать снова: ?include_empty_rows=1
        if (!$request->boolean('include_empty_rows')) {
            $query->where(function ($q) {
                $q->where('stock', '>', 0)
                    ->orWhere('reserved_stock', '>', 0);
            });
        }

        if ($search !== '') {
            // Как в UI: «бренд + название». Полный запрос не лежит ни в name, ни в brand по отдельности.
            $search = trim((string) preg_replace('/\s+/u', ' ', $search));
            $like = '%' . mb_strtolower($search, 'UTF-8') . '%';
            $brandNameSub = '(SELECT `name` FROM `brands` WHERE `brands`.`id` = `products`.`brand_id` LIMIT 1)';
            $displayNameExpr = "LOWER(TRIM(CONCAT(COALESCE({$brandNameSub}, ''), ' ', COALESCE(`products`.`name`, ''))))";

            $query->where(function ($balanceQuery) use ($search, $like, $displayNameExpr) {
                $balanceQuery->whereHas('product', function ($productQuery) use ($like, $displayNameExpr) {
                    $productQuery->whereRaw("{$displayNameExpr} LIKE ?", [$like]);
                });
            });
        }

        if ($warehouseId > 0) {
            $query->where('warehouse_id', $warehouseId);
        }

        if ($stockState === 'in_stock') {
            $query->where('stock', '>', 0);
        } elseif ($stockState === 'reserved') {
            $query->where('reserved_stock', '>', 0);
        } elseif ($stockState === 'available') {
            $query->whereRaw('(stock - reserved_stock) > 0');
        } elseif ($stockState === 'out_of_stock') {
            $query->where('stock', '<=', 0);
        }

        $sort = trim((string) $request->input('sort', 'brand'));
        $dir = strtolower(trim((string) $request->input('dir', 'asc')));
        if (!in_array($dir, ['asc', 'desc'], true)) {
            $dir = 'asc';
        }

        $balancesQuery = $query
            ->leftJoin('products', 'products.id', '=', 'warehouse_variant_stocks.product_id')
            ->leftJoin('brands', 'brands.id', '=', 'products.brand_id')
            ->select('warehouse_variant_stocks.*');

        if ($sort === 'stock') {
            $balancesQuery
                ->orderBy('warehouse_variant_stocks.stock', $dir)
                ->orderBy('brands.name')
                ->orderBy('products.name');
        } elseif ($sort === 'reserved') {
            $balancesQuery
                ->orderBy('warehouse_variant_stocks.reserved_stock', $dir)
                ->orderBy('brands.name')
                ->orderBy('products.name');
        } else {
            $balancesQuery
                ->orderByRaw('brands.name IS NULL')
                ->orderBy('brands.name')
                ->orderBy('products.name');
        }

        $balances = $balancesQuery->paginate($perPage);
        $collection = $balances->getCollection();
        $minPriceMap = $this->stockLotService->minPurchasePriceMapForRows($collection);
        $lineTotalMap = $this->stockLotService->lineTotalMapForRows($collection);

        $balances->through(function (WarehouseVariantStock $row) use ($minPriceMap, $lineTotalMap) {
            $warehouseId = (int) ($row->warehouse_id ?? 0);
            $variantId = (int) ($row->variant_id ?? 0);
            $entryKey = $warehouseId.':'.$variantId;

            return [
                'id' => $row->id,
                'variant_id' => $row->variant_id,
                'warehouse_id' => $row->warehouse_id,
                'warehouse_name' => $row->warehouse?->name,
                'product_id' => $row->product_id,
                'product_name' => $row->product?->name,
                'product_slug' => $row->product?->slug,
                'brand_name' => $row->product?->brand?->name,
                'variant_title' => $row->variant?->title,
                'stock' => (int) $row->stock,
                'reserved_stock' => (int) $row->reserved_stock,
                'available_stock' => (int) $row->available_stock,
                'price' => $minPriceMap[$entryKey] ?? null,
                'line_total' => $lineTotalMap[$entryKey] ?? null,
                'wholesale_price' => $row->variant?->wholesale_price,
                'is_active' => (bool) ($row->variant?->is_active ?? false),
            ];
        });

        $payload = $balances->toArray();
        $payload['last_wholesale_calculated_at'] = $this->wholesalePriceService->lastCalculatedAt();

        return response()->json($payload);
    }

    public function recalculateWholesale(): JsonResponse
    {
        return response()->json($this->wholesalePriceService->recalculate());
    }

    public function exportWholesale(): StreamedResponse
    {
        return $this->wholesalePriceService->exportXlsx();
    }

    public function variantSuppliers(Request $request): JsonResponse
    {
        $variantId = (int) $request->input('variant_id', 0);
        if ($variantId <= 0) {
            return response()->json(['message' => 'variant_id is required'], 422);
        }

        $warehouseId = (int) $request->input('warehouse_id', 0);

        if ($warehouseId > 0) {
            $lots = $this->stockLotService
                ->openLotsForVariant($warehouseId, $variantId)
                ->load(['receiptItem.receipt']);
        } else {
            $lots = WarehouseStockLot::query()
                ->where('variant_id', $variantId)
                ->where('qty', '>', 0)
                ->orderByRaw('supplier_price IS NULL')
                ->orderBy('supplier_price')
                ->orderByRaw("CASE WHEN comment IS NULL OR TRIM(comment) = '' THEN 0 ELSE 1 END")
                ->orderBy('id')
                ->with(['receiptItem.receipt'])
                ->get();
        }

        $rows = $lots
            ->map(function (WarehouseStockLot $lot) {
                $receivedAt = $lot->receiptItem?->receipt?->received_at;
                $payload = is_array($lot->receiptItem?->payload) ? $lot->receiptItem->payload : [];
                $supplierProductName = trim((string) (
                    $payload['supplier_product_name']
                    ?? $payload['title']
                    ?? $payload['name']
                    ?? ''
                ));

                return [
                    'source' => 'lot',
                    'lot_id' => (int) $lot->id,
                    'qty' => (int) $lot->qty,
                    'reserved_qty' => (int) $lot->reserved_qty,
                    'available' => (int) $lot->available_qty,
                    'supplier_price' => $lot->supplier_price,
                    'supplier_sku' => $lot->supplier_sku,
                    'supplier_name' => $lot->supplier_name !== null && trim((string) $lot->supplier_name) !== ''
                        ? trim((string) $lot->supplier_name)
                        : '—',
                    'supplier_product_name' => $supplierProductName !== '' ? $supplierProductName : null,
                    'comment' => $lot->comment,
                    'received_at' => $receivedAt?->toDateString(),
                ];
            })
            ->values();

        return response()->json([
            'data' => $rows,
        ]);
    }

    public function updateLotComment(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        /** @var WarehouseStockLot $lot */
        $lot = WarehouseStockLot::query()->findOrFail($id);

        $commentRaw = $validated['comment'] ?? null;
        $comment = $commentRaw === null || trim((string) $commentRaw) === ''
            ? null
            : trim((string) $commentRaw);

        $lot->update(['comment' => $comment]);
        $lot->refresh();

        return response()->json(['data' => $lot]);
    }
}
