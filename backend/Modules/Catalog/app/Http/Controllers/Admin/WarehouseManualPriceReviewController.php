<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\WarehouseManualPriceReview;
use Modules\Catalog\Services\ListingMinPriceService;
use Modules\Catalog\Services\Pricing\WarehousePurchasePriceResolver;
use Modules\Warehouse\Models\StockReceiptItem;

class WarehouseManualPriceReviewController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->input('per_page', 25);
        // 2000 ≈ «показать все»; выше — риск тяжёлого ответа/рендера.
        if (! in_array($perPage, [25, 50, 100, 2000], true)) {
            $perPage = 25;
        }

        $query = WarehouseManualPriceReview::query()
            ->active()
            ->with(['receiptSupplier:id,name,code'])
            ->orderByDesc('updated_at')
            ->orderByDesc('id');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($q) use ($search): void {
                $q->where('product_name', 'like', "%{$search}%")
                    ->orWhere('variant_title', 'like', "%{$search}%")
                    ->orWhere('supplier_sku', 'like', "%{$search}%")
                    ->orWhere('supplier_external_code', 'like', "%{$search}%");
            });
        }

        $items = $query->paginate($perPage);

        return response()->json($items);
    }

    public function stats(): JsonResponse
    {
        $count = WarehouseManualPriceReview::query()->active()->count();

        return response()->json(['data' => ['active_count' => $count]]);
    }

    public function update(
        Request $request,
        int $id,
        ListingMinPriceService $listingMinPrice,
        WarehousePurchasePriceResolver $purchasePriceResolver,
    ): JsonResponse {
        $review = WarehouseManualPriceReview::query()->active()->findOrFail($id);

        $validated = $request->validate([
            'manual_retail_price' => ['sometimes', 'numeric', 'min:0'],
            'warehouse_purchase' => ['sometimes', 'numeric', 'min:0'],
            'list_on_storefront' => ['sometimes', 'boolean'],
        ]);

        if (
            ! array_key_exists('manual_retail_price', $validated)
            && ! array_key_exists('warehouse_purchase', $validated)
        ) {
            return response()->json([
                'message' => 'Нужно передать manual_retail_price или warehouse_purchase',
            ], 422);
        }

        $variant = ProductVariantLink::query()->findOrFail((int) $review->variant_id);

        DB::transaction(function () use ($review, $variant, $validated, $listingMinPrice, $purchasePriceResolver): void {
            $reviewPatch = [];
            $variantPatch = [];

            if (array_key_exists('warehouse_purchase', $validated)) {
                $warehousePurchase = number_format((float) $validated['warehouse_purchase'], 2, '.', '');
                $reviewPatch['warehouse_purchase'] = $warehousePurchase;
                $this->syncLastPostedReceiptPurchase(
                    $purchasePriceResolver,
                    (int) $review->variant_id,
                    $warehousePurchase,
                );
            }

            if (array_key_exists('manual_retail_price', $validated)) {
                $retail = number_format((float) $validated['manual_retail_price'], 2, '.', '');
                $variantPatch['price'] = $retail;
                $reviewPatch['manual_retail_price'] = $retail;
                $reviewPatch['manual_set_by'] = Auth::id();
                $reviewPatch['manual_set_at'] = now();
            }

            if (array_key_exists('list_on_storefront', $validated)) {
                $listOnStorefront = (bool) $validated['list_on_storefront'];
                $variantPatch['is_active'] = $listOnStorefront;
                $reviewPatch['list_on_storefront'] = $listOnStorefront;
            }

            if ($variantPatch !== []) {
                $variant->update($variantPatch);
            }

            if ($reviewPatch !== []) {
                $review->update($reviewPatch);
            }

            if ($variant->product_id && array_key_exists('manual_retail_price', $validated)) {
                $listingMinPrice->syncForProduct((int) $variant->product_id);
            }
        });

        return response()->json([
            'message' => 'Цена сохранена',
            'data' => $review->fresh(['receiptSupplier:id,name,code']),
        ]);
    }

    private function syncLastPostedReceiptPurchase(
        WarehousePurchasePriceResolver $purchasePriceResolver,
        int $variantId,
        string $warehousePurchase,
    ): void {
        $mainWarehouseId = $purchasePriceResolver->resolveMainWarehouseId();
        if ($mainWarehouseId <= 0 || $variantId <= 0) {
            return;
        }

        $meta = $purchasePriceResolver->lastPostedReceiptMetaForMainWarehouse(
            [$variantId],
            $mainWarehouseId,
        )[$variantId] ?? null;

        if ($meta === null) {
            return;
        }

        $item = StockReceiptItem::query()
            ->where('stock_receipt_id', $meta['stock_receipt_id'])
            ->where('variant_id', $variantId)
            ->where('supplier_price', '>', 0)
            ->orderByDesc('id')
            ->first();

        if ($item === null) {
            return;
        }

        $item->update([
            'supplier_price' => $warehousePurchase,
            'line_total' => round((float) $item->qty * (float) $warehousePurchase, 2),
        ]);
    }
}
