<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\WarehouseManualPriceReview;
use Modules\Catalog\Services\ListingMinPriceService;
use Modules\Catalog\Models\ProductVariantLink;

class WarehouseManualPriceReviewController extends Controller
{
    public function index(Request $request): JsonResponse
    {
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

        $items = $query->paginate(30);

        return response()->json($items);
    }

    public function stats(): JsonResponse
    {
        $count = WarehouseManualPriceReview::query()->active()->count();

        return response()->json(['data' => ['active_count' => $count]]);
    }

    public function update(Request $request, int $id, ListingMinPriceService $listingMinPrice): JsonResponse
    {
        $review = WarehouseManualPriceReview::query()->active()->findOrFail($id);

        $validated = $request->validate([
            'manual_retail_price' => ['required', 'numeric', 'min:0'],
            'list_on_storefront' => ['required', 'boolean'],
        ]);

        $variant = ProductVariantLink::query()->findOrFail((int) $review->variant_id);

        DB::transaction(function () use ($review, $variant, $validated, $listingMinPrice): void {
            $retail = number_format((float) $validated['manual_retail_price'], 2, '.', '');
            $current = $variant->price !== null ? number_format((float) $variant->price, 2, '.', '') : null;

            $variantUpdates = [
                'price' => $retail,
                'is_active' => (bool) $validated['list_on_storefront'],
            ];

            if ($current !== null && $current !== $retail) {
                $variantUpdates['old_price'] = $current;
            }

            $variant->update($variantUpdates);

            $review->update([
                'manual_retail_price' => $retail,
                'list_on_storefront' => (bool) $validated['list_on_storefront'],
                'manual_set_by' => Auth::id(),
                'manual_set_at' => now(),
            ]);

            if ($variant->product_id) {
                $listingMinPrice->syncForProduct((int) $variant->product_id);
            }
        });

        return response()->json([
            'message' => 'Цена сохранена',
            'data' => $review->fresh(['receiptSupplier:id,name,code']),
        ]);
    }
}
