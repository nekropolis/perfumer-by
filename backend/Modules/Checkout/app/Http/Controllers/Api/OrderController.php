<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Warehouse\Services\StockInventoryService;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;

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
            'data' => new OrderResource($order),
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

            if ($nextStatus === 'completed') {
                $stockService->completeOrder($order);
            }
        });

        $order->load('items');

        return response()->json([
            'data' => new OrderResource($order),
            'message' => 'Order status updated',
        ]);
    }
}
