<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Warehouse\Models\StockWriteoff;
use Modules\Warehouse\Services\StockInventoryService;

class OrderController extends Controller
{
    public function stats(): JsonResponse
    {
        $newCount = Order::query()->where('status', 'new')->count();

        return response()->json([
            'data' => [
                'by_status' => [
                    'new' => $newCount,
                ],
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $status = trim((string) $request->input('status', ''));

        $orders = Order::query()
            ->with([
                'items.variant.supplierOffers.supplier',
            ])
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($subQuery) use ($search) {
                    if (is_numeric($search)) {
                        $subQuery->orWhere('id', (int) $search);
                    }

                    $subQuery
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%");
                });
            })
            ->when($status !== '', function ($query) use ($status) {
                $query->where('status', $status);
            })
            ->latest('id')
            ->paginate(20);

        return response()->json([
            'data' => OrderResource::collection($orders->getCollection()),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page' => $orders->lastPage(),
                'per_page' => $orders->perPage(),
                'total' => $orders->total(),
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $order = Order::query()
            ->with([
                'items.variant.supplierOffers.supplier',
            ])
            ->findOrFail($id);

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
        ]);
    }

    /**
     * Досоздание складского списания по заказу «Выполнен», если раньше не вызвался completeOrder (например, баг со статусом).
     */
    public function syncInventoryWriteoff(int $id): JsonResponse
    {
        $order = Order::query()->with('items')->findOrFail($id);

        if (!in_array($order->status, ['done', 'completed'], true)) {
            return response()->json([
                'message' => 'Списание можно создать только для заказа со статусом «Выполнен».',
            ], 422);
        }

        if (StockWriteoff::query()->where('type', 'order')->where('order_id', $order->id)->exists()) {
            return response()->json([
                'message' => 'По этому заказу уже есть складское списание.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($order) {
                app(StockInventoryService::class)->completeOrder($order);
            });
        } catch (\Illuminate\Validation\ValidationException $e) {
            $errors = $e->errors();
            $first = collect($errors)->flatten()->first();

            return response()->json([
                'message' => is_string($first) && $first !== '' ? $first : 'Не удалось создать списание.',
                'errors' => $errors,
            ], 422);
        }

        $order->refresh()->load([
            'items.variant.supplierOffers.supplier',
        ]);

        return response()->json([
            'message' => 'Списание по резервам создано.',
            'data' => $this->orderPayloadWithInventoryFlag($order),
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'max:50'],
        ]);

        $order = Order::query()->findOrFail($id);
        $previousStatus = (string) $order->status;

        DB::transaction(function () use ($order, $validated, $previousStatus) {
            $order->update([
                'status' => $validated['status'],
            ]);

            $order->load('items');
            $stockService = app(StockInventoryService::class);
            $nextStatus = (string) $validated['status'];

            if ($previousStatus !== 'new' && $nextStatus === 'new') {
                $stockService->reserveForOrder($order);
            }

            if ($nextStatus === 'cancelled') {
                $stockService->releaseForOrder($order);
            }

            // Фронт админки использует статус `done` («Выполнен»); `completed` оставляем для совместимости.
            if (in_array($nextStatus, ['done', 'completed'], true)) {
                $stockService->completeOrder($order);
            }
        });

        $order->load('items');

        return response()->json([
            'data' => $this->orderPayloadWithInventoryFlag($order),
            'message' => 'Order status updated',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function orderPayloadWithInventoryFlag(Order $order): array
    {
        return array_merge(
            (new OrderResource($order))->toArray(request()),
            [
                'can_sync_inventory_writeoff' => $this->orderNeedsInventoryWriteoffSync($order),
            ],
        );
    }

    private function orderNeedsInventoryWriteoffSync(Order $order): bool
    {
        if (!in_array($order->status, ['done', 'completed'], true)) {
            return false;
        }

        return !StockWriteoff::query()
            ->where('type', 'order')
            ->where('order_id', $order->id)
            ->exists();
    }
}
