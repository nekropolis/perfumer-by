<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Http\Resources\OrderResource;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Support\OrderAccountScope;
use Modules\Users\Models\Client;

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
        /** @var Client $client */
        $client = $request->user();

        OrderAccountScope::linkOrdersForClient($client);

        $orders = OrderAccountScope::queryForClient($client)
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
        /** @var Client $client */
        $client = $request->user();

        OrderAccountScope::linkOrdersForClient($client);

        $order = Order::query()
            ->with(self::ORDER_RELATIONS)
            ->findOrFail($id);

        if (! OrderAccountScope::clientCanAccess($order, $client)) {
            abort(404);
        }

        return response()->json([
            'data' => new OrderResource($order),
        ]);
    }
}
