<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSeoGeneration;
use Modules\Catalog\Services\SeoDescription\ProductSeoGenerationService;

class ProductSeoGenerationAdminController extends Controller
{
    public function preview(int $id, ProductSeoGenerationService $service): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $active = ProductSeoGeneration::query()
            ->where('product_id', $product->id)
            ->whereIn('status', ProductSeoGeneration::ACTIVE_STATUSES)
            ->latest('id')
            ->first();

        return response()->json([
            'data' => [
                'fields' => $service->preview($product),
                'active_generation' => $active ? $this->generationData($active) : null,
            ],
        ]);
    }

    public function store(
        Request $request,
        int $id,
        ProductSeoGenerationService $service,
    ): JsonResponse {
        $validated = $request->validate([
            'fields' => ['required', 'array', 'min:1'],
            'fields.*' => ['nullable', 'string'],
            'confirm_manual_changes' => ['nullable', 'boolean'],
        ]);

        $product = Product::query()->findOrFail($id);
        $generation = $service->start(
            $product,
            array_map('strval', array_keys($validated['fields'])),
            (bool) ($validated['confirm_manual_changes'] ?? false),
        );

        return response()->json([
            'message' => 'SEO-генерация поставлена в очередь.',
            'data' => $this->generationData($generation),
        ], 202);
    }

    public function show(int $id, int $generation): JsonResponse
    {
        $item = ProductSeoGeneration::query()
            ->where('product_id', $id)
            ->findOrFail($generation);

        return response()->json(['data' => $this->generationData($item)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function generationData(ProductSeoGeneration $generation): array
    {
        return [
            'id' => $generation->id,
            'product_id' => $generation->product_id,
            'status' => $generation->status,
            'external_status' => $generation->external_status,
            'requested_fields' => $generation->requested_fields,
            'result' => $generation->result,
            'request_payload' => $generation->source_snapshot,
            'raw_result' => $generation->result,
            'error' => $generation->error,
            'conflict' => $generation->status === ProductSeoGeneration::STATUS_CONFLICTED,
            'attempts' => $generation->attempts,
            'created_at' => optional($generation->created_at)?->toIso8601String(),
            'finished_at' => optional($generation->finished_at)?->toIso8601String(),
        ];
    }
}
