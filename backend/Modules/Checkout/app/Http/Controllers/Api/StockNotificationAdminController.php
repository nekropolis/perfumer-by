<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Checkout\Http\Resources\StockNotificationRequestResource;
use Modules\Checkout\Models\StockNotificationRequest;

class StockNotificationAdminController extends Controller
{
    protected const ALLOWED_STATUSES = ['new', 'notified', 'cancelled'];

    /**
     * Счётчики «новых» заявок по виду — для бейджей в админ-сайдбаре.
     */
    public function stats(): JsonResponse
    {
        $rows = StockNotificationRequest::query()
            ->selectRaw('kind, COUNT(*) as c')
            ->where('status', 'new')
            ->whereIn('kind', StockNotificationRequest::ALLOWED_KINDS)
            ->groupBy('kind')
            ->pluck('c', 'kind');

        return response()->json([
            'data' => [
                'back_in_stock_new' => (int) ($rows[StockNotificationRequest::KIND_BACK_IN_STOCK] ?? 0),
                'callback_new' => (int) ($rows[StockNotificationRequest::KIND_CALLBACK] ?? 0),
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $status = trim((string) $request->input('status', ''));
        $kind = trim((string) $request->input('kind', ''));

        $query = StockNotificationRequest::query()
            ->with('product')
            ->when($search !== '', function ($q) use ($search) {
                $q->where(function ($inner) use ($search) {
                    if (is_numeric($search)) {
                        $inner->orWhere('id', (int) $search);
                        $inner->orWhere('product_id', (int) $search);
                    }

                    $inner
                        ->orWhere('phone', 'like', "%{$search}%")
                        ->orWhere('product_name', 'like', "%{$search}%")
                        ->orWhere('variant_title', 'like', "%{$search}%");
                });
            })
            ->when($status !== '', function ($q) use ($status) {
                $q->where('status', $status);
            })
            ->when($kind !== '' && in_array($kind, StockNotificationRequest::ALLOWED_KINDS, true), function ($q) use ($kind) {
                $q->where('kind', $kind);
            })
            ->latest('id');

        $paginated = $query->paginate(25);

        return response()->json([
            'data' => StockNotificationRequestResource::collection($paginated->getCollection()),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(self::ALLOWED_STATUSES)],
        ]);

        $record = StockNotificationRequest::query()->findOrFail($id);

        $record->update([
            'status' => $validated['status'],
            'notified_at' => $validated['status'] === 'notified'
                ? ($record->notified_at ?? now())
                : $record->notified_at,
        ]);

        $record->load('product');

        return response()->json([
            'data' => new StockNotificationRequestResource($record),
            'message' => 'Статус обновлён',
        ]);
    }
}
