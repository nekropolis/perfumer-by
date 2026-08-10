<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Services\ProductMadeInCountrySyncService;
use RuntimeException;
use Throwable;

class OrderReceiptMadeInController extends Controller
{
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
}
