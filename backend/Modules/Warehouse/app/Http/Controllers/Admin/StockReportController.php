<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReservation;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Models\Warehouse;

class StockReportController extends Controller
{
    public function orderReservations(Request $request): JsonResponse
    {
        $productId = (int) $request->input('product_id', 0);
        $page = max(1, (int) $request->input('page', 1));
        $perPage = 50;

        $supplierWarehouseId = (int) Warehouse::query()
            ->where('code', Warehouse::CODE_SUPPLIER)
            ->value('id');

        if ($supplierWarehouseId <= 0) {
            return response()->json([
                'data' => [],
                'current_page' => $page,
                'last_page' => 1,
                'total' => 0,
            ]);
        }

        $query = StockReservation::query()
            ->with([
                'variant',
                'warehouse',
            ])
            ->where('status', 'active')
            ->where('warehouse_id', $supplierWarehouseId)
            ->whereHas('variant')
            ->whereHas('warehouse', fn ($warehouseQuery) => $warehouseQuery->where('code', Warehouse::CODE_SUPPLIER))
            ->whereHas('product')
            ->whereIn('order_id', Order::query()->where('status', 'new')->select('id'))
            ->when($productId > 0, fn ($subQuery) => $subQuery->where('product_id', $productId))
            ->orderByDesc('reserved_at')
            ->orderByDesc('id');

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $rows = collect($paginator->items());

        $variantIds = $rows
            ->pluck('variant_id')
            ->filter(fn ($id) => $id !== null)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $offersByVariant = $variantIds->isEmpty()
            ? collect()
            : SupplierVariantOffer::query()
                ->with('supplier')
                ->whereIn('product_variant_id', $variantIds->all())
                ->where('is_active', true)
                ->orderByDesc('last_seen_at')
                ->orderByDesc('id')
                ->get()
                ->groupBy('product_variant_id');

        $data = $rows->map(function (StockReservation $reservation) use ($offersByVariant): array {
            /** @var SupplierVariantOffer|null $offer */
            $offer = $offersByVariant->get((int) $reservation->variant_id)?->first();

            return [
                'reservation_id' => (int) $reservation->id,
                'order_id' => (int) $reservation->order_id,
                'product_id' => (int) $reservation->product_id,
                'variant_id' => (int) $reservation->variant_id,
                'product_name' => $reservation->product?->name,
                'variant_title' => $reservation->variant?->title,
                'qty' => (int) $reservation->qty,
                'reserved_at' => $reservation->reserved_at?->toIso8601String(),
                'supplier_name' => $offer?->supplier?->name,
                'supplier_product_name' => $offer?->external_product_name
                    ?: $offer?->external_variant_name,
                'supplier_code' => $offer?->external_id ?: $offer?->sku,
                'supplier_price' => $offer?->purchase_price !== null
                    ? number_format((float) $offer->purchase_price, 2, '.', '')
                    : null,
            ];
        })->values();

        return response()->json([
            'data' => $data,
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(),
        ]);
    }

    public function receipts(Request $request): JsonResponse
    {
        $dateFrom = trim((string) $request->input('date_from', ''));
        $dateTo = trim((string) $request->input('date_to', ''));
        $supplierCode = trim((string) $request->input('supplier_code', ''));
        $supplierId = (int) $request->input('supplier_id', 0);
        $productId = (int) $request->input('product_id', 0);
        $warehouseId = (int) $request->input('warehouse_id', 0);

        $query = StockReceipt::query()->with('items');

        if ($dateFrom !== '') {
            $query->whereDate('received_at', '>=', $dateFrom);
        }
        if ($dateTo !== '') {
            $query->whereDate('received_at', '<=', $dateTo);
        }
        if ($supplierCode !== '') {
            $query->where('supplier_code', $supplierCode);
        }
        if ($supplierId > 0) {
            $query->where('supplier_id', $supplierId);
        }
        if ($productId > 0) {
            $query->whereHas('items', fn ($itemsQuery) => $itemsQuery->where('product_id', $productId));
        }
        if ($warehouseId > 0) {
            $query->where('warehouse_id', $warehouseId);
        }

        $items = (clone $query)
            ->orderByDesc('received_at')
            ->orderByDesc('id')
            ->paginate(30);

        $summary = (clone $query)
            ->selectRaw('COUNT(*) as documents_count')
            ->selectRaw('COALESCE(SUM((SELECT COALESCE(SUM(stock_receipt_items.qty), 0) FROM stock_receipt_items WHERE stock_receipt_items.stock_receipt_id = stock_receipts.id)), 0) as qty_total')
            ->selectRaw('COALESCE(SUM((SELECT COALESCE(SUM(stock_receipt_items.line_total), 0) FROM stock_receipt_items WHERE stock_receipt_items.stock_receipt_id = stock_receipts.id)), 0) as amount_total')
            ->first();

        return response()->json([
            'data' => $items->items(),
            'current_page' => $items->currentPage(),
            'last_page' => $items->lastPage(),
            'total' => $items->total(),
            'summary' => [
                'documents_count' => (int) ($summary->documents_count ?? 0),
                'qty_total' => (int) ($summary->qty_total ?? 0),
                'amount_total' => (float) ($summary->amount_total ?? 0),
            ],
        ]);
    }

    public function writeoffs(Request $request): JsonResponse
    {
        $dateFrom = trim((string) $request->input('date_from', ''));
        $dateTo = trim((string) $request->input('date_to', ''));
        $type = trim((string) $request->input('type', ''));
        $productId = (int) $request->input('product_id', 0);
        $warehouseId = (int) $request->input('warehouse_id', 0);

        $query = StockWriteoff::query()->with('items');

        if ($dateFrom !== '') {
            $query->whereDate('written_off_at', '>=', $dateFrom);
        }
        if ($dateTo !== '') {
            $query->whereDate('written_off_at', '<=', $dateTo);
        }
        if ($type !== '') {
            $query->where('type', $type);
        }
        if ($productId > 0) {
            $query->whereHas('items', fn ($itemsQuery) => $itemsQuery->where('product_id', $productId));
        }
        if ($warehouseId > 0) {
            $query->where('warehouse_id', $warehouseId);
        }

        $items = (clone $query)
            ->orderByDesc('written_off_at')
            ->orderByDesc('id')
            ->paginate(30);

        $summary = (clone $query)
            ->selectRaw('COUNT(*) as documents_count')
            ->selectRaw('COALESCE(SUM((SELECT COALESCE(SUM(stock_writeoff_items.qty), 0) FROM stock_writeoff_items WHERE stock_writeoff_items.stock_writeoff_id = stock_writeoffs.id)), 0) as qty_total')
            ->first();

        return response()->json([
            'data' => $items->items(),
            'current_page' => $items->currentPage(),
            'last_page' => $items->lastPage(),
            'total' => $items->total(),
            'summary' => [
                'documents_count' => (int) ($summary->documents_count ?? 0),
                'qty_total' => (int) ($summary->qty_total ?? 0),
            ],
        ]);
    }

    public function sales(Request $request): JsonResponse
    {
        $dateFrom = trim((string) $request->input('date_from', ''));
        $dateTo = trim((string) $request->input('date_to', ''));
        $reportBy = trim((string) $request->input('report_by', 'orders')) ?: 'orders';
        $groupBy = trim((string) $request->input('group_by', 'day')) ?: 'day';
        $productId = (int) $request->input('product_id', 0);
        $productIdsRaw = $request->input('product_ids', []);
        $productIds = collect(is_array($productIdsRaw) ? $productIdsRaw : [])
            ->map(static fn ($id) => (int) $id)
            ->filter(static fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($dateFrom === '') {
            $dateFrom = now()->startOfDay()->toDateString();
        }
        if ($dateTo === '') {
            $dateTo = now()->toDateString();
        }

        $periodSql = match ($groupBy) {
            'year' => "DATE_FORMAT(orders.created_at, '%Y')",
            'month' => "DATE_FORMAT(orders.created_at, '%Y-%m')",
            default => "DATE(orders.created_at)",
        };

        $baseQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', ['done', 'completed']);

        $baseQuery->whereDate('orders.created_at', '>=', $dateFrom);
        $baseQuery->whereDate('orders.created_at', '<=', $dateTo);
        if ($productId > 0) {
            $baseQuery->where('order_items.product_id', $productId);
        }
        if (!empty($productIds)) {
            $baseQuery->whereIn('order_items.product_id', $productIds);
        }

        if ($reportBy === 'products') {
            $rows = (clone $baseQuery)
                ->selectRaw('order_items.product_id as product_id')
                ->selectRaw('order_items.product_name as product_name')
                ->selectRaw('order_items.variant_title as variant_title')
                ->selectRaw('COALESCE(SUM(order_items.qty), 0) as qty_total')
                ->groupBy('order_items.product_id', 'order_items.product_name', 'order_items.variant_title')
                ->orderByDesc('qty_total')
                ->get();
        } else {
            $rows = (clone $baseQuery)
                ->selectRaw("{$periodSql} as period")
                ->selectRaw('COUNT(DISTINCT orders.id) as orders_count')
                ->selectRaw('SUM(order_items.qty) as qty_total')
                ->selectRaw('SUM(order_items.total) as revenue_total')
                ->groupBy(DB::raw($periodSql))
                ->orderBy('period')
                ->get();
        }

        $summary = (clone $baseQuery)
            ->selectRaw('COUNT(DISTINCT orders.id) as orders_count')
            ->selectRaw('COALESCE(SUM(order_items.qty), 0) as qty_total')
            ->selectRaw('COALESCE(SUM(order_items.total), 0) as revenue_total')
            ->first();

        return response()->json([
            'data' => $rows,
            'report_by' => $reportBy === 'products' ? 'products' : 'orders',
            'summary' => [
                'orders_count' => (int) ($summary->orders_count ?? 0),
                'qty_total' => (int) ($summary->qty_total ?? 0),
                'revenue_total' => (float) ($summary->revenue_total ?? 0),
            ],
        ]);
    }
}
