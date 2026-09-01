<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Models\OrderStatus;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseStockLot;

class StockReportController extends Controller
{
    public function orderReservations(Request $request): JsonResponse
    {
        $productId = (int) $request->input('product_id', 0);
        $orderId = (int) $request->input('order_id', 0);
        $page = max(1, (int) $request->input('page', 1));
        $perPage = 50;

        $orderProductStatuses = OrderStatus::codesForOrderProducts();
        if ($orderProductStatuses === []) {
            return response()->json([
                'data' => [],
                'current_page' => 1,
                'last_page' => 1,
                'total' => 0,
                'filter_orders' => [],
            ]);
        }

        $baseQuery = OrderItem::query()
            ->select(['order_items.*', 'orders.status as order_status'])
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', $orderProductStatuses);

        $filterOrderIds = (clone $baseQuery)
            ->reorder()
            ->select('order_items.order_id')
            ->distinct()
            ->pluck('order_items.order_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->sortDesc()
            ->values()
            ->all();

        $items = $baseQuery
            ->with(['product.brand:id,name', 'variant'])
            ->when($productId > 0, fn ($subQuery) => $subQuery->where('order_items.product_id', $productId))
            ->when($orderId > 0, fn ($subQuery) => $subQuery->where('order_items.order_id', $orderId))
            ->orderByDesc('orders.id')
            ->orderBy('order_items.product_name')
            ->orderBy('order_items.variant_title')
            ->get();

        $variantIds = $items
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
                ->orderBy('purchase_price')
                ->orderByDesc('last_seen_at')
                ->orderByDesc('id')
                ->get()
                ->groupBy('product_variant_id');

        $mainWarehouseId = (int) (Warehouse::query()
            ->where('code', Warehouse::CODE_MAIN)
            ->value('id') ?? 0);

        $lotsByVariant = ($variantIds->isEmpty() || $mainWarehouseId <= 0)
            ? collect()
            : WarehouseStockLot::query()
                ->where('warehouse_id', $mainWarehouseId)
                ->whereIn('variant_id', $variantIds->all())
                ->where('qty', '>', 0)
                ->orderByRaw('supplier_price IS NULL')
                ->orderBy('supplier_price')
                ->orderBy('id')
                ->get()
                ->groupBy('variant_id');

        $rows = [];
        foreach ($items as $item) {
            $availabilitySource = (string) ($item->availability_source ?? 'unavailable');
            $waitingDiscount = (bool) ($item->waiting_discount ?? false);
            // Как в админке заказа: склад / офер. Скидка за ожидание на main+supplier → офер.
            $useMain = in_array($availabilitySource, ['main', 'main+supplier'], true) && ! $waitingDiscount;
            $useOffer = in_array($availabilitySource, ['supplier_only', 'supplier_warehouse'], true)
                || ($availabilitySource === 'main+supplier' && $waitingDiscount);
            $hasMainStock = in_array($availabilitySource, ['main', 'main+supplier'], true);
            $allocatedLotIds = collect(is_array($item->stock_lot_allocations) ? $item->stock_lot_allocations : [])
                ->map(static fn ($row) => (int) ($row['lot_id'] ?? 0))
                ->filter(static fn (int $id) => $id > 0)
                ->unique()
                ->values()
                ->all();
            $selectedOfferId = (int) ($item->supplier_variant_offer_id ?? 0);
            $suppliers = [];

            // Складские строки: открытые партии с ценой закупки.
            if ($hasMainStock) {
                $lots = $lotsByVariant->get((int) $item->variant_id, collect());

                if ($lots->isNotEmpty()) {
                    $warehouseSelectedAssigned = false;
                    foreach ($lots as $lot) {
                        $lotId = (int) $lot->id;
                        if ($useMain && $allocatedLotIds !== []) {
                            $isSelected = in_array($lotId, $allocatedLotIds, true);
                        } elseif ($useMain && $selectedOfferId <= 0 && ! $warehouseSelectedAssigned) {
                            $isSelected = true;
                            $warehouseSelectedAssigned = true;
                        } else {
                            $isSelected = false;
                        }
                        $suppliers[] = [
                            'kind' => 'warehouse',
                            'name' => 'Склад',
                            'product_name' => $lot->comment ?: $item->variant_title,
                            'code' => $lot->supplier_sku,
                            'price' => $lot->supplier_price !== null
                                ? number_format((float) $lot->supplier_price, 2, '.', '')
                                : null,
                            'qty' => (int) $lot->qty,
                            'lot_id' => $lotId,
                            'offer_id' => null,
                            'comment' => $lot->comment,
                            'is_selected' => $isSelected,
                        ];
                    }
                } else {
                    $suppliers[] = [
                        'kind' => 'warehouse',
                        'name' => 'Склад',
                        'product_name' => null,
                        'code' => null,
                        'price' => null,
                        'lot_id' => null,
                        'offer_id' => null,
                        'is_selected' => $useMain && $selectedOfferId <= 0,
                    ];
                }
            }

            // Активные офферы поставщиков для варианта.
            $offers = $offersByVariant->get((int) $item->variant_id);
            $offerSelectedAssigned = false;
            if ($offers !== null) {
                foreach ($offers as $offer) {
                    $offerId = (int) $offer->id;
                    if ($useOffer && $selectedOfferId > 0) {
                        $isSelected = $offerId === $selectedOfferId;
                    } elseif ($useOffer && $selectedOfferId <= 0 && ! $offerSelectedAssigned) {
                        $isSelected = true;
                        $offerSelectedAssigned = true;
                    } else {
                        $isSelected = false;
                    }
                    $suppliers[] = [
                        'kind' => 'offer',
                        'name' => $offer->supplier?->name,
                        'product_name' => $offer->external_product_name
                            ?: $offer->external_variant_name,
                        'code' => $offer->external_id ?: $offer->sku,
                        'price' => $offer->purchase_price !== null
                            ? number_format((float) $offer->purchase_price, 2, '.', '')
                            : null,
                        'lot_id' => null,
                        'offer_id' => $offerId,
                        'is_selected' => $isSelected,
                    ];
                }
            }

            // Если нет ни склада, ни офферов — показываем пустую строку,
            // чтобы товар не потерялся из списка.
            if ($suppliers === []) {
                $suppliers[] = [
                    'kind' => null,
                    'name' => null,
                    'product_name' => null,
                    'code' => null,
                    'price' => null,
                    'lot_id' => null,
                    'offer_id' => null,
                    'is_selected' => false,
                ];
            }

            $orderStatusCode = trim((string) ($item->order_status ?? ''));
            $orderStatusDisplay = $orderStatusCode !== ''
                ? OrderStatus::displayForCode($orderStatusCode)
                : ['label' => '—', 'color' => '#64748B'];

            $brandName = trim((string) ($item->brand_name ?? $item->product?->brand?->name ?? ''));
            $productName = trim((string) ($item->product_name ?: $item->product?->name ?? ''));
            if ($brandName !== '' && $productName !== '') {
                $stripped = ProductDisplayName::stripBrandFromName($brandName, $productName);
                $shortName = $stripped['found'] ? (string) $stripped['name'] : $productName;
                $displayProductName = ProductDisplayName::format($brandName, $shortName);
            } else {
                $displayProductName = $productName !== '' ? $productName : $brandName;
            }

            $rows[] = [
                'id' => "oi-{$item->id}",
                'order_item_id' => (int) $item->id,
                'order_id' => (int) $item->order_id,
                'product_id' => (int) $item->product_id,
                'variant_id' => (int) $item->variant_id,
                'product_name' => $displayProductName !== '' ? $displayProductName : null,
                'variant_title' => $item->variant_title ?: $item->variant?->title,
                'qty' => (int) $item->qty,
                'availability_source' => $availabilitySource !== '' ? $availabilitySource : null,
                'supplier_variant_offer_id' => $selectedOfferId > 0 ? $selectedOfferId : null,
                'order_status' => $orderStatusCode !== '' ? $orderStatusCode : null,
                'order_status_label' => $orderStatusDisplay['label'],
                'order_status_color' => $orderStatusDisplay['color'],
                'suppliers' => $suppliers,
            ];
        }

        $total = count($rows);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $offset = ($page - 1) * $perPage;
        $pageRows = array_slice($rows, $offset, $perPage);

        return response()->json([
            'data' => $pageRows,
            'current_page' => $page,
            'last_page' => $lastPage,
            'total' => $total,
            'filter_orders' => $filterOrderIds,
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
            if ($type === 'writeoff') {
                $query->whereIn('type', ['order', 'manual']);
            } else {
                $query->where('type', $type);
            }
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
