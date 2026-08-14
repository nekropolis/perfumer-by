<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Services\ProductMadeInCountrySyncService;
use Modules\Checkout\Models\OrderItem;
use RuntimeException;
use Throwable;

class OrderReceiptMadeInController extends Controller
{
    public function index(Request $request, ProductMadeInCountrySyncService $sync): JsonResponse
    {
        $validated = $request->validate([
            'order_ids' => ['required'],
        ]);

        $orderIds = $this->parseIds($validated['order_ids']);
        if ($orderIds === []) {
            return response()->json(['data' => []]);
        }

        $productIds = OrderItem::query()
            ->whereIn('order_id', $orderIds)
            ->whereNotNull('product_id')
            ->pluck('product_id')
            ->all();

        $data = [];
        foreach ($sync->mapForProductIds($productIds) as $productId => $country) {
            $data[] = [
                'product_id' => $productId,
                'country' => $country,
            ];
        }

        return response()->json(['data' => $data]);
    }

    public function __invoke(
        Request $request,
        ProductMadeInCountrySyncService $sync,
    ): JsonResponse {
        $validated = $request->validate([
            'updates' => ['required', 'array', 'min:1'],
            'updates.*.product_id' => ['required', 'integer', 'min:1'],
            'updates.*.country' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $result = $sync->syncMany($validated['updates']);
        } catch (RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'data' => $result,
            'message' => sprintf(
                'Сохранено стран: %d',
                count($result['updated'] ?? []),
            ),
        ]);
    }

    /**
     * @return list<int>
     */
    private function parseIds(mixed $raw): array
    {
        if (is_string($raw)) {
            $raw = explode(',', $raw);
        }

        if (! is_array($raw)) {
            $raw = [$raw];
        }

        return array_values(array_slice(array_unique(array_filter(
            array_map(static fn ($id) => (int) $id, $raw),
            static fn (int $id) => $id > 0,
        )), 0, 100));
    }
}
