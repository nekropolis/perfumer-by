<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Support\OrderAccountScope;

class MyOrdersController extends Controller
{
    private const ORDER_RELATIONS = [
        'items.product.mainImage',
        'discountCard:id,card_number',
        'giftCertificatePurchases',
        'orderGiftCertificates.giftCertificate',
        'soldGiftCertificates.template',
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        OrderAccountScope::linkOrdersForUser($user);

        $orders = OrderAccountScope::queryForUser($user)
            ->with(self::ORDER_RELATIONS)
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

        OrderAccountScope::linkOrdersForUser($user);

        $order = Order::query()
            ->with(self::ORDER_RELATIONS)
            ->findOrFail($id);

        if (! OrderAccountScope::userCanAccess($order, $user)) {
            abort(404);
        }

        return response()->json([
            'data' => new OrderResource($order),
        ]);
    }
}
