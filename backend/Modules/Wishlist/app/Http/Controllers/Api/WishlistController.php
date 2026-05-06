<?php

namespace Modules\Wishlist\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Catalog\Http\Resources\ProductListResource;
use Modules\Catalog\Models\Product;
use Modules\Wishlist\Models\WishlistItem;

class WishlistController extends Controller
{
    public function preview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_ids' => ['nullable', 'array', 'max:200'],
            'product_ids.*' => ['integer', 'min:1'],
        ]);

        $productIds = collect($validated['product_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        $products = $this->resolveProductsByIds($productIds);

        return response()->json([
            'data' => ProductListResource::collection($products)->resolve(),
            'meta' => [
                'qty' => $products->count(),
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $userId = (int) $request->user()->id;

        $productIds = WishlistItem::query()
            ->where('user_id', $userId)
            ->orderByDesc('id')
            ->pluck('product_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        $products = $this->resolveProductsByIds($productIds);

        return response()->json([
            'data' => ProductListResource::collection($products)->resolve(),
            'meta' => [
                'qty' => $products->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
        ]);

        WishlistItem::query()->firstOrCreate([
            'user_id' => (int) $request->user()->id,
            'product_id' => (int) $validated['product_id'],
        ]);

        return $this->index($request);
    }

    public function destroy(Request $request, int $productId): JsonResponse
    {
        WishlistItem::query()
            ->where('user_id', (int) $request->user()->id)
            ->where('product_id', $productId)
            ->delete();

        return $this->index($request);
    }

    public function sync(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_ids' => ['required', 'array', 'max:200'],
            'product_ids.*' => ['integer', 'exists:products,id'],
        ]);

        $userId = (int) $request->user()->id;
        $targetIds = collect($validated['product_ids'])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $removeQuery = WishlistItem::query()->where('user_id', $userId);
        if (!empty($targetIds)) {
            $removeQuery->whereNotIn('product_id', $targetIds);
        }
        $removeQuery->delete();

        $existing = WishlistItem::query()
            ->where('user_id', $userId)
            ->pluck('product_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $toCreate = array_values(array_diff($targetIds, $existing));
        if (!empty($toCreate)) {
            WishlistItem::query()->insert(
                array_map(
                    fn (int $productId) => [
                        'user_id' => $userId,
                        'product_id' => $productId,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ],
                    $toCreate
                )
            );
        }

        return $this->index($request);
    }

    /**
     * @param int[] $productIds
     */
    private function resolveProductsByIds(array $productIds)
    {
        if (empty($productIds)) {
            return collect();
        }

        $orderMap = array_flip($productIds);

        return Product::query()
            ->whereIn('id', $productIds)
            ->where('is_active', true)
            ->with([
                'brand',
                'mainCategory',
                'images' => ProductListResource::imagesForListingEagerLoad(),
                'activeVariants',
            ])
            ->get()
            ->sortBy(fn (Product $product) => $orderMap[$product->id] ?? PHP_INT_MAX)
            ->values();
    }
}
