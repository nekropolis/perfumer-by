<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\WarehouseManualPriceReview;
use Modules\Catalog\Services\ListingMinPriceService;
use Modules\Catalog\Services\Pricing\PriceFormulaResolver;
use Modules\Catalog\Services\Pricing\WarehousePurchasePriceResolver;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePricingService;

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

        if ($request->filled('reason')) {
            $reason = trim($request->string('reason')->toString());
            $allowed = [
                WarehouseManualPriceReview::REASON_NO_SUPPLIER_MATCH,
                WarehouseManualPriceReview::REASON_WAREHOUSE_OFFER_GAP,
                WarehouseManualPriceReview::REASON_WAREHOUSE_BLEND_GAP,
                WarehouseManualPriceReview::REASON_ALLPARFUME_NO_MATCH,
                WarehouseManualPriceReview::REASON_ALLPARFUME_NO_INPUT,
            ];
            if (in_array($reason, $allowed, true)) {
                $query->where('reason', $reason);
            }
        }

        $items = $query->paginate($perPage);

        return response()->json($items);
    }

    public function stats(): JsonResponse
    {
        $count = WarehouseManualPriceReview::query()->active()->count();

        return response()->json(['data' => ['active_count' => $count]]);
    }

    public function previewRetail(
        Request $request,
        int $id,
        PriceFormulaResolver $formulaResolver,
        WarehousePurchasePriceResolver $purchasePriceResolver,
        SellerOnePricingService $sellerOnePricing,
    ): JsonResponse {
        $review = WarehouseManualPriceReview::query()->active()->findOrFail($id);
        $validated = $request->validate([
            'formula_input' => ['required', 'numeric', 'min:0'],
        ]);

        $variant = ProductVariantLink::query()->findOrFail((int) $review->variant_id);
        $formulaInput = (float) $validated['formula_input'];
        $mainWarehouseId = $purchasePriceResolver->resolveMainWarehouseId();

        $retail = null;
        if ($mainWarehouseId > 0) {
            $retail = $formulaResolver->calculateRetailPrice(
                $variant,
                $formulaInput,
                PriceFormula::SOURCE_WAREHOUSE,
                $mainWarehouseId,
            );
        }
        if ($retail === null) {
            $retail = $sellerOnePricing->calculateRetailPrice($formulaInput, $variant, null);
        }

        return response()->json([
            'data' => [
                'formula_input' => number_format(round($formulaInput, 1), 2, '.', ''),
                'manual_retail_price' => MoneyDecimal::normalize($retail),
            ],
        ]);
    }

    public function update(
        Request $request,
        int $id,
        ListingMinPriceService $listingMinPrice,
    ): JsonResponse {
        $review = WarehouseManualPriceReview::query()->active()->findOrFail($id);

        $validated = $request->validate([
            'manual_retail_price' => ['sometimes', 'numeric', 'min:0'],
            'warehouse_purchase' => ['sometimes', 'numeric', 'min:0'],
            'formula_input' => ['sometimes', 'numeric', 'min:0'],
            'list_on_storefront' => ['sometimes', 'boolean'],
        ]);

        if (
            ! array_key_exists('manual_retail_price', $validated)
            && ! array_key_exists('warehouse_purchase', $validated)
            && ! array_key_exists('formula_input', $validated)
            && ! array_key_exists('list_on_storefront', $validated)
        ) {
            return response()->json([
                'message' => 'Нужно передать manual_retail_price, warehouse_purchase, formula_input или list_on_storefront',
            ], 422);
        }

        $variant = ProductVariantLink::query()->findOrFail((int) $review->variant_id);

        DB::transaction(function () use (
            $review,
            $variant,
            $validated,
            $listingMinPrice,
        ): void {
            $reviewPatch = [];
            $variantPatch = [];

            if (array_key_exists('warehouse_purchase', $validated)) {
                $warehousePurchase = number_format((float) $validated['warehouse_purchase'], 2, '.', '');
                $reviewPatch['warehouse_purchase'] = $warehousePurchase;
            }

            if (array_key_exists('formula_input', $validated)) {
                $reviewPatch['formula_input'] = number_format(round((float) $validated['formula_input'], 1), 2, '.', '');
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
                if ($listOnStorefront) {
                    $reviewPatch['manual_set_by'] = Auth::id();
                    $reviewPatch['manual_set_at'] = now();
                }
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
}
