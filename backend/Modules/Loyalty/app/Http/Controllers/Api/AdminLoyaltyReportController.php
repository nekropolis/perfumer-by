<?php

namespace Modules\Loyalty\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\Order;
use Modules\Loyalty\Models\DiscountCard;

class AdminLoyaltyReportController extends Controller
{
    public function cards(Request $request): JsonResponse
    {
        $from = $request->date('from');
        $to = $request->date('to');

        $cards = DiscountCard::query()
            ->withCount(['transactions as purchases_count' => function ($q) use ($from, $to) {
                $q->where('type', 'order_completed')
                    ->when($from, fn ($s) => $s->whereDate('created_at', '>=', $from))
                    ->when($to, fn ($s) => $s->whereDate('created_at', '<=', $to));
            }])
            ->withSum(['transactions as subtotal_sum' => function ($q) use ($from, $to) {
                $q->where('type', 'order_completed')
                    ->when($from, fn ($s) => $s->whereDate('created_at', '>=', $from))
                    ->when($to, fn ($s) => $s->whereDate('created_at', '<=', $to));
            }], 'order_subtotal')
            ->orderByDesc('id')
            ->paginate(20);

        $ordersWithCards = Order::query()
            ->whereNotNull('discount_card_id')
            ->when($from, fn ($q) => $q->whereDate('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('created_at', '<=', $to))
            ->count();

        return response()->json([
            'cards' => $cards,
            'meta' => [
                'orders_with_cards' => $ordersWithCards,
            ],
        ]);
    }
}
