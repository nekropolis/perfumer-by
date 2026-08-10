<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Catalog\Models\ProductSeoBatch;
use Modules\Catalog\Services\SeoDescription\ProductSeoWorkQueueService;
use Modules\Catalog\Services\SeoDescription\SeoDescriptionException;

class ProductSeoWorkAdminController extends Controller
{
    public function overview(ProductSeoWorkQueueService $service): JsonResponse
    {
        return response()->json([
            'data' => $service->overview(),
        ]);
    }

    public function queueBadge(ProductSeoWorkQueueService $service): JsonResponse
    {
        return response()->json([
            'data' => $service->queueBadge(),
        ]);
    }

    public function batches(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->input('per_page', 25), 100));

        $paginator = ProductSeoBatch::query()
            ->withCount([
                'items',
                'items as applied_items_count' => fn ($q) => $q->where('status', 'applied'),
                'items as failed_items_count' => fn ($q) => $q->where('status', 'failed'),
            ])
            ->latest('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())->map(fn (ProductSeoBatch $batch) => [
                'id' => $batch->id,
                'external_batch_id' => $batch->external_batch_id,
                'status' => $batch->status,
                'requested_count' => $batch->requested_count,
                'accepted_count' => $batch->accepted_count,
                'queued_count' => $batch->queued_count,
                'applied_count' => $batch->applied_count,
                'failed_count' => $batch->failed_count,
                'force' => $batch->force,
                'error' => $batch->error,
                'items_count' => (int) ($batch->items_count ?? 0),
                'applied_items_count' => (int) ($batch->applied_items_count ?? 0),
                'failed_items_count' => (int) ($batch->failed_items_count ?? 0),
                'submitted_at' => optional($batch->submitted_at)?->toIso8601String(),
                'created_at' => optional($batch->created_at)?->toIso8601String(),
            ])->values(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(),
            'per_page' => $paginator->perPage(),
        ]);
    }

    public function submitWork(Request $request, ProductSeoWorkQueueService $service): JsonResponse
    {
        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
            'force' => ['nullable', 'boolean'],
        ]);

        try {
            $batch = $service->submitChunk(
                isset($validated['limit']) ? (int) $validated['limit'] : null,
                (bool) ($validated['force'] ?? false),
            );
        } catch (SeoDescriptionException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'message' => 'Пачка отправлена в SEO API.',
            'data' => [
                'id' => $batch->id,
                'external_batch_id' => $batch->external_batch_id,
                'status' => $batch->status,
                'requested_count' => $batch->requested_count,
                'accepted_count' => $batch->accepted_count,
                'queued_count' => $batch->queued_count,
            ],
        ], 202);
    }

    public function pullReady(Request $request, ProductSeoWorkQueueService $service): JsonResponse
    {
        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        try {
            $result = $service->pullAndApplyReady(
                isset($validated['limit']) ? (int) $validated['limit'] : null,
            );
        } catch (SeoDescriptionException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'message' => 'Готовые описания обработаны.',
            'data' => $result,
        ]);
    }
}
