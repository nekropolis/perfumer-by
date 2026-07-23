<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Warehouse\Models\StockReceipt;
use Modules\Warehouse\Models\StockReceiptItem;
use Modules\Warehouse\Models\WarehouseVariantStock;

class StockBalanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $stockState = trim((string) $request->input('stock_state', ''));
        $warehouseId = (int) $request->input('warehouse_id', 0);
        $perPage = (int) $request->input('per_page', 25);
        if (!in_array($perPage, [25, 50, 100], true)) {
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
            $query->where(function ($balanceQuery) use ($search) {
                $balanceQuery->whereHas('product', function ($productQuery) use ($search) {
                    $productQuery->where('name', 'like', "%{$search}%")
                        ->orWhereHas('brand', function ($brandQuery) use ($search) {
                            $brandQuery->where('name', 'like', "%{$search}%");
                        });
                })->orWhereHas('variant', function ($variantQuery) use ($search) {
                    $variantQuery->where('price', 'like', "%{$search}%");
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

        $balances = $balancesQuery
            ->paginate($perPage)
            ->through(function (WarehouseVariantStock $row) {
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
                    'price' => $row->variant?->price,
                    'is_active' => (bool) ($row->variant?->is_active ?? false),
                ];
            });

        return response()->json($balances);
    }

    public function variantSuppliers(Request $request): JsonResponse
    {
        $variantId = (int) $request->input('variant_id', 0);
        if ($variantId <= 0) {
            return response()->json(['message' => 'variant_id is required'], 422);
        }

        $receiptRows = StockReceiptItem::query()
            ->with(['receipt.supplier'])
            ->where('variant_id', $variantId)
            ->whereHas('receipt', function ($receiptQuery) {
                $receiptQuery->where('status', StockReceipt::STATUS_POSTED);
            })
            ->orderByDesc('id')
            ->get();

        $supplierCodes = $receiptRows
            ->map(fn (StockReceiptItem $item) => trim((string) ($item->receipt?->supplier_code ?? '')))
            ->filter(fn (string $code) => $code !== '')
            ->unique()
            ->values();

        $suppliersByCode = $supplierCodes->isEmpty()
            ? collect()
            : Supplier::query()
                ->whereIn('code', $supplierCodes->all())
                ->get(['id', 'code', 'name'])
                ->keyBy(fn (Supplier $supplier) => (string) $supplier->code);

        $receiptRows = $receiptRows
            ->map(function (StockReceiptItem $item) use ($suppliersByCode) {
                $payload = is_array($item->payload) ? $item->payload : [];
                $code = trim((string) ($item->receipt?->supplier_code ?? ''));
                $supplierName = trim((string) (
                    $item->receipt?->supplier?->name
                    ?: ($code !== '' ? ($suppliersByCode->get($code)?->name ?? '') : '')
                    ?: $item->receipt?->supplier_name
                    ?: $code
                    ?: ''
                ));

                return [
                    'source' => 'receipt',
                    'supplier_name' => $supplierName !== '' ? $supplierName : '—',
                    'supplier_sku' => $item->supplier_sku,
                    'supplier_product_name' => $payload['supplier_product_name']
                        ?? $payload['title']
                        ?? $payload['name']
                        ?? $item->product_name
                        ?? $item->variant_title,
                    'supplier_price' => $item->supplier_price,
                ];
            })
            ->unique(function (array $row) {
                return implode('|', [
                    (string) ($row['supplier_name'] ?? ''),
                    (string) ($row['supplier_sku'] ?? ''),
                    (string) ($row['supplier_product_name'] ?? ''),
                    (string) ($row['supplier_price'] ?? ''),
                ]);
            })
            ->values();

        $offerRows = SupplierVariantOffer::query()
            ->with(['supplier'])
            ->where('product_variant_id', $variantId)
            ->where('is_active', true)
            ->orderByDesc('id')
            ->get()
            ->map(function (SupplierVariantOffer $offer) {
                $payload = is_array($offer->payload) ? $offer->payload : [];
                $supplierName = trim((string) ($offer->supplier?->name ?: ''));
                $productName = trim((string) (
                    $payload['supplier_product_name']
                    ?? $payload['title']
                    ?? $offer->external_product_name
                    ?? $offer->external_variant_name
                    ?? ''
                ));

                return [
                    'source' => 'offer',
                    'supplier_name' => $supplierName !== '' ? $supplierName : '—',
                    'supplier_sku' => $offer->external_id ?: $offer->sku,
                    'supplier_product_name' => $productName !== '' ? $productName : null,
                    'supplier_price' => $payload['supplier_price'] ?? $offer->purchase_price,
                ];
            })
            ->unique(function (array $row) {
                return implode('|', [
                    (string) ($row['supplier_name'] ?? ''),
                    (string) ($row['supplier_sku'] ?? ''),
                    (string) ($row['supplier_product_name'] ?? ''),
                    (string) ($row['supplier_price'] ?? ''),
                ]);
            })
            ->values();

        return response()->json([
            'data' => $receiptRows->concat($offerRows)->values(),
        ]);
    }
}
