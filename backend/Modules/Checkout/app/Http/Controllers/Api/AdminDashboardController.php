<?php

namespace Modules\Checkout\Http\Controllers\Api;

use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Product;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Models\StockNotificationRequest;

class AdminDashboardController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $period = $this->resolvePeriod((string) $request->query('period', 'month'));
        [$dateFrom, $dateTo, $bucketFormat, $bucketStep] = $this->resolveRangeAndBucket($period);

        $activeOrders = Order::query()
            ->whereNotIn('status', ['done', 'completed', 'cancelled'])
            ->count();

        $activeOrdersByStatus = Order::query()
            ->selectRaw('status, COUNT(*) as c')
            ->whereNotIn('status', ['done', 'completed', 'cancelled'])
            ->groupBy('status')
            ->pluck('c', 'status')
            ->map(fn ($value) => (int) $value)
            ->toArray();

        $activeBackInStockRequests = StockNotificationRequest::query()
            ->where('kind', StockNotificationRequest::KIND_BACK_IN_STOCK)
            ->where('status', 'new')
            ->count();
        $backInStockByStatus = StockNotificationRequest::query()
            ->selectRaw('status, COUNT(*) as c')
            ->where('kind', StockNotificationRequest::KIND_BACK_IN_STOCK)
            ->where('status', 'new')
            ->groupBy('status')
            ->pluck('c', 'status')
            ->map(fn ($value) => (int) $value)
            ->toArray();

        $activeCallbackRequests = StockNotificationRequest::query()
            ->where('kind', StockNotificationRequest::KIND_CALLBACK)
            ->where('status', 'new')
            ->count();
        $callbackByStatus = StockNotificationRequest::query()
            ->selectRaw('status, COUNT(*) as c')
            ->where('kind', StockNotificationRequest::KIND_CALLBACK)
            ->where('status', 'new')
            ->groupBy('status')
            ->pluck('c', 'status')
            ->map(fn ($value) => (int) $value)
            ->toArray();

        $activeProductsInStock = Product::query()
            ->where('is_active', true)
            ->whereHas('activeVariants')
            ->count();

        $activeVariantsInStock = Product::query()
            ->where('is_active', true)
            ->withCount('activeVariants')
            ->get()
            ->sum('active_variants_count');

        $monthlyItemsBaseQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereBetween('orders.created_at', [$dateFrom, $dateTo]);

        $orderedProductsMonth = (int) (clone $monthlyItemsBaseQuery)->sum('order_items.qty');
        $cancelledProductsMonth = (int) (clone $monthlyItemsBaseQuery)
            ->where('orders.status', 'cancelled')
            ->sum('order_items.qty');
        $soldProductsMonth = (int) (clone $monthlyItemsBaseQuery)
            ->whereIn('orders.status', ['done', 'completed'])
            ->sum('order_items.qty');

        $orderedByBucket = $this->aggregateByBucket(
            (clone $monthlyItemsBaseQuery),
            $bucketFormat
        );
        $cancelledByBucket = $this->aggregateByBucket(
            (clone $monthlyItemsBaseQuery)->where('orders.status', 'cancelled'),
            $bucketFormat
        );
        $soldByBucket = $this->aggregateByBucket(
            (clone $monthlyItemsBaseQuery)->whereIn('orders.status', ['done', 'completed']),
            $bucketFormat
        );

        [$labels, $orderedSeries, $cancelledSeries, $soldSeries] = $this->buildTimelineSeries(
            $dateFrom,
            $dateTo,
            $bucketStep,
            $orderedByBucket,
            $cancelledByBucket,
            $soldByBucket
        );

        return response()->json([
            'data' => [
                'active' => [
                    'orders' => $activeOrders,
                    'orders_by_status' => $activeOrdersByStatus,
                    'back_in_stock_requests' => $activeBackInStockRequests,
                    'back_in_stock_by_status' => $backInStockByStatus,
                    'callback_requests' => $activeCallbackRequests,
                    'callback_by_status' => $callbackByStatus,
                ],
                'stock' => [
                    'products_in_stock' => $activeProductsInStock,
                    'variants_in_stock' => $activeVariantsInStock,
                ],
                'month' => [
                    'period' => $period,
                    'ordered_products_qty' => $orderedProductsMonth,
                    'cancelled_products_qty' => $cancelledProductsMonth,
                    'sold_products_qty' => $soldProductsMonth,
                    'timeline' => [
                        'labels' => $labels,
                        'ordered' => $orderedSeries,
                        'cancelled' => $cancelledSeries,
                        'sold' => $soldSeries,
                    ],
                ],
            ],
        ]);
    }

    private function resolvePeriod(string $period): string
    {
        return in_array($period, ['month', 'quarter', 'year'], true) ? $period : 'month';
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: string, 3: string}
     */
    private function resolveRangeAndBucket(string $period): array
    {
        $now = CarbonImmutable::now();

        if ($period === 'year') {
            return [
                $now->startOfYear(),
                $now->endOfYear(),
                '%Y-%m',
                '1 month',
            ];
        }

        if ($period === 'quarter') {
            return [
                $now->startOfQuarter(),
                $now->endOfQuarter(),
                '%Y-%m',
                '1 month',
            ];
        }

        return [
            $now->startOfMonth(),
            $now->endOfMonth(),
            '%Y-%m-%d',
            '1 day',
        ];
    }

    /**
     * @param \Illuminate\Database\Query\Builder|\Illuminate\Database\Eloquent\Builder $query
     * @return array<string, int>
     */
    private function aggregateByBucket($query, string $bucketFormat): array
    {
        return $query
            ->selectRaw("DATE_FORMAT(orders.created_at, '{$bucketFormat}') as bucket, SUM(order_items.qty) as qty")
            ->groupBy('bucket')
            ->pluck('qty', 'bucket')
            ->map(fn ($value) => (int) $value)
            ->toArray();
    }

    /**
     * @param array<string, int> $orderedByBucket
     * @param array<string, int> $cancelledByBucket
     * @param array<string, int> $soldByBucket
     * @return array{0: array<int, string>, 1: array<int, int>, 2: array<int, int>, 3: array<int, int>}
     */
    private function buildTimelineSeries(
        CarbonImmutable $dateFrom,
        CarbonImmutable $dateTo,
        string $bucketStep,
        array $orderedByBucket,
        array $cancelledByBucket,
        array $soldByBucket
    ): array {
        $labels = [];
        $ordered = [];
        $cancelled = [];
        $sold = [];

        $period = CarbonPeriod::create($dateFrom, $bucketStep, $dateTo);
        foreach ($period as $point) {
            $isDaily = $bucketStep === '1 day';
            $bucketKey = $isDaily
                ? $point->format('Y-m-d')
                : $point->format('Y-m');
            $label = $isDaily
                ? $point->format('d.m')
                : $point->locale('ru')->translatedFormat('M');

            $labels[] = $label;
            $ordered[] = (int) ($orderedByBucket[$bucketKey] ?? 0);
            $cancelled[] = (int) ($cancelledByBucket[$bucketKey] ?? 0);
            $sold[] = (int) ($soldByBucket[$bucketKey] ?? 0);
        }

        return [$labels, $ordered, $cancelled, $sold];
    }
}
