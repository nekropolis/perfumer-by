<?php

namespace Modules\ImportExport\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\ImportExport\Models\ImportRetryItem;
use Modules\ImportExport\Services\ImportRetryQueue;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class ImportRetryQueueAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'task_type' => ['nullable', 'string', 'in:'.ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES.','.ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES.','.ImportRetryItem::TASK_DESCRIPTION_REWRITE],
            'status' => ['nullable', 'string', 'in:all,'.ImportRetryItem::STATUS_PENDING.','.ImportRetryItem::STATUS_DISMISSED.','.ImportRetryItem::STATUS_RESOLVED],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $query = ImportRetryItem::query()
            ->with(['product:id,name,slug'])
            ->orderByDesc('id');

        $status = (string) ($validated['status'] ?? ImportRetryItem::STATUS_PENDING);
        if ($status !== 'all') {
            $query->where('status', $status);
        }

        if (! empty($validated['task_type'])) {
            $query->where('task_type', $validated['task_type']);
        }

        $perPage = (int) ($validated['per_page'] ?? 25);

        $paginator = $query->paginate($perPage);

        $pendingByTask = ImportRetryItem::query()
            ->where('status', ImportRetryItem::STATUS_PENDING)
            ->select('task_type', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('task_type')
            ->get()
            ->mapWithKeys(static fn ($row) => [(string) $row->task_type => (int) $row->aggregate])
            ->all();

        $payload = $paginator->toArray();
        $payload['counts'] = [
            'pending_total' => (int) ImportRetryItem::query()
                ->where('status', ImportRetryItem::STATUS_PENDING)
                ->count(),
            'pending_by_task' => $pendingByTask,
        ];

        return response()->json($payload);
    }

    public function dismiss(Request $request, ImportRetryQueue $queue): JsonResponse
    {
        $validated = $request->validate([
            'task_type' => ['required', 'string', 'in:'.ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES.','.ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES.','.ImportRetryItem::TASK_DESCRIPTION_REWRITE],
            'product_id' => ['required', 'integer', 'min:1'],
        ]);

        $queue->dismiss($validated['task_type'], (int) $validated['product_id']);

        return response()->json(['message' => 'Запись снята с очереди']);
    }

    public function retryOne(Request $request, VanilleImportService $vanilleImportService): JsonResponse
    {
        $validated = $request->validate([
            'task_type' => ['required', 'string', 'in:'.ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES.','.ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES.','.ImportRetryItem::TASK_DESCRIPTION_REWRITE],
            'product_id' => ['required', 'integer', 'min:1'],
        ]);

        $job = $vanilleImportService->enqueueRetryFailed(
            $validated['task_type'],
            [(int) $validated['product_id']]
        );

        return response()->json([
            'message' => 'Задача повтора поставлена в очередь',
            'job' => $job,
        ], 202);
    }

    public function runBulkRetry(Request $request, VanilleImportService $vanilleImportService): JsonResponse
    {
        $validated = $request->validate([
            'task_type' => ['required', 'string', 'in:'.ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES.','.ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES.','.ImportRetryItem::TASK_DESCRIPTION_REWRITE],
        ]);

        $job = $vanilleImportService->enqueueRetryFailed($validated['task_type'], null);

        return response()->json([
            'message' => 'Фоновая обработка очереди запущена',
            'job' => $job,
        ], 202);
    }

    public function dismissById(int $id, ImportRetryQueue $queue): JsonResponse
    {
        $item = ImportRetryItem::query()->findOrFail($id);
        $queue->dismiss((string) $item->task_type, (int) $item->product_id);

        return response()->json(['message' => 'Запись снята с очереди']);
    }

    public function retryOneById(int $id, VanilleImportService $vanilleImportService): JsonResponse
    {
        $item = ImportRetryItem::query()->findOrFail($id);

        $job = $vanilleImportService->enqueueRetryFailed(
            (string) $item->task_type,
            [(int) $item->product_id]
        );

        return response()->json([
            'message' => 'Задача повтора поставлена в очередь',
            'job' => $job,
        ], 202);
    }

    public function run(Request $request, VanilleImportService $vanilleImportService): JsonResponse
    {
        return $this->runBulkRetry($request, $vanilleImportService);
    }
}
