<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;

class MyOrdersController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $orders = Order::query()
            ->with(['items.product.mainImage', 'giftCertificatePurchases', 'orderGiftCertificates.giftCertificate', 'soldGiftCertificates.template'])
            ->where('user_id', $user->id)
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

    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $order = Order::query()
            ->with(['items.product.mainImage', 'giftCertificatePurchases', 'orderGiftCertificates.giftCertificate', 'soldGiftCertificates.template'])
            ->where('user_id', $user->id)
            ->findOrFail($id);

        return response()->json([
            'data' => new OrderResource($order),
        ]);
    }
}
