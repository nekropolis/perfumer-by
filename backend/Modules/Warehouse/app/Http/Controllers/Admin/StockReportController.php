<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Checkout\Models\OrderItem;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockWriteoff;

class StockReportController extends Controller
{
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
        $groupBy = trim((string) $request->input('group_by', 'day')) ?: 'day';
        $productId = (int) $request->input('product_id', 0);

        $periodSql = $groupBy === 'month'
            ? "DATE_FORMAT(orders.created_at, '%Y-%m')"
            : "DATE(orders.created_at)";

        $baseQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.status', 'completed');

        if ($dateFrom !== '') {
            $baseQuery->whereDate('orders.created_at', '>=', $dateFrom);
        }
        if ($dateTo !== '') {
            $baseQuery->whereDate('orders.created_at', '<=', $dateTo);
        }
        if ($productId > 0) {
            $baseQuery->where('order_items.product_id', $productId);
        }

        $rows = (clone $baseQuery)
            ->selectRaw("{$periodSql} as period")
            ->selectRaw('COUNT(DISTINCT orders.id) as orders_count')
            ->selectRaw('SUM(order_items.qty) as qty_total')
            ->selectRaw('SUM(order_items.total) as revenue_total')
            ->groupBy(DB::raw($periodSql))
            ->orderBy('period')
            ->get();

        $summary = (clone $baseQuery)
            ->selectRaw('COUNT(DISTINCT orders.id) as orders_count')
            ->selectRaw('COALESCE(SUM(order_items.qty), 0) as qty_total')
            ->selectRaw('COALESCE(SUM(order_items.total), 0) as revenue_total')
            ->first();

        return response()->json([
            'data' => $rows,
            'summary' => [
                'orders_count' => (int) ($summary->orders_count ?? 0),
                'qty_total' => (int) ($summary->qty_total ?? 0),
                'revenue_total' => (float) ($summary->revenue_total ?? 0),
            ],
        ]);
    }
}
