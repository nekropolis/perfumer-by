<?php

namespace Modules\Warehouse\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Warehouse\Models\WarehouseVariantStock;

class StockBalanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $stockState = trim((string) $request->input('stock_state', ''));
        $warehouseId = (int) $request->input('warehouse_id', 0);

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
            $query->where(function ($variantQuery) use ($search) {
                $variantQuery->whereHas('product', function ($productQuery) use ($search) {
                    $productQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('slug', 'like', "%{$search}%");
                })->orWhereHas('variant.definition', function ($definitionQuery) use ($search) {
                    $definitionQuery->where('title', 'like', "%{$search}%");
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

        $balances = $query
            ->orderByDesc('stock')
            ->orderByDesc('reserved_stock')
            ->paginate(30)
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
}
