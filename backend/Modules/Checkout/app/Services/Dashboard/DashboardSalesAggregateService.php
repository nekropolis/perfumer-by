<?php

namespace Modules\Checkout\Services\Dashboard;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Services\Pricing\BynRateService;
use Modules\Checkout\Models\Order;
use Modules\Warehouse\Models\WarehouseStockLot;

final class DashboardSalesAggregateService
{
    public const int TOP_SOLD_LIMIT = 10;

    /** @var list<string> */
    private const array SOLD_STATUSES = ['done', 'completed'];

    public function __construct(
        private readonly OrderSaleContributionCalculator $calculator,
        private readonly DashboardSalesPeriod $period,
        private readonly BynRateService $bynRate,
    ) {}

    public function syncOrder(Order $order): void
    {
        if (! $this->tablesReady()) {
            return;
        }

        $order->loadMissing('items');

        DB::transaction(function () use ($order): void {
            if (in_array((string) $order->status, self::SOLD_STATUSES, true)) {
                $this->applyOrder($order);

                return;
            }

            $this->reverseOrder((int) $order->id);
        });
    }

    public function forgetOrder(Order $order): void
    {
        if (! $this->tablesReady()) {
            return;
        }

        DB::transaction(function () use ($order): void {
            $this->reverseOrder((int) $order->id);
        });
    }

    public function rebuild(): int
    {
        if (! $this->tablesReady()) {
            return 0;
        }

        DB::table('dashboard_sold_orders')->delete();
        DB::table('dashboard_daily_product_sales')->delete();
        DB::table('dashboard_daily_finance')->delete();

        $applied = 0;
        Order::query()
            ->whereIn('status', self::SOLD_STATUSES)
            ->with('items')
            ->orderBy('id')
            ->chunkById(100, function ($orders) use (&$applied): void {
                [$pricesByOrder, $allocationsByItemId] = $this->preloadReservationCosts($orders);
                foreach ($orders as $order) {
                    DB::transaction(function () use ($order, $pricesByOrder, $allocationsByItemId): void {
                        $this->applyOrder(
                            $order,
                            $pricesByOrder[(int) $order->id] ?? [],
                            $this->allocationsForOrder($order, $allocationsByItemId),
                        );
                    });
                    $applied++;
                }
            });

        return $applied;
    }

    /**
     * @return list<array{
     *     id: int,
     *     name: string,
     *     slug: string|null,
     *     qty: int,
     *     variants: list<array{id: int, title: string, qty: int}>
     * }>
     */
    public function topSoldProducts(string $from, string $to, int $limit = self::TOP_SOLD_LIMIT): array
    {
        if (! $this->tablesReady()) {
            return [];
        }

        $limit = max(1, $limit);
        $rows = DB::table('dashboard_daily_product_sales as s')
            ->leftJoin('products', 'products.id', '=', 's.product_id')
            ->leftJoin('brands', 'brands.id', '=', 'products.brand_id')
            ->where('s.product_id', '>', 0)
            ->whereBetween('s.sold_on', [$from, $to])
            ->groupBy('s.product_id')
            ->orderByDesc(DB::raw('SUM(s.qty)'))
            ->orderBy('s.product_id')
            ->limit($limit)
            ->get([
                's.product_id as id',
                DB::raw('MAX(products.name) as live_name'),
                DB::raw('MAX(s.product_name) as snapshot_name'),
                DB::raw('MAX(products.slug) as live_slug'),
                DB::raw('MAX(s.product_slug) as snapshot_slug'),
                DB::raw('MAX(brands.name) as brand_name'),
                DB::raw('SUM(s.qty) as qty'),
            ]);

        if ($rows->isEmpty()) {
            return [];
        }

        $ids = $rows->map(static fn (object $row): int => (int) $row->id)->all();
        $variantRows = DB::table('dashboard_daily_product_sales')
            ->whereBetween('sold_on', [$from, $to])
            ->whereIn('product_id', $ids)
            ->groupBy('product_id', 'variant_id')
            ->orderByDesc(DB::raw('SUM(qty)'))
            ->get([
                'product_id',
                'variant_id',
                DB::raw('MAX(variant_title) as variant_title'),
                DB::raw('SUM(qty) as qty'),
            ])
            ->groupBy(static fn (object $row): int => (int) $row->product_id);

        return $rows
            ->map(function (object $row) use ($variantRows): array {
                $id = (int) $row->id;
                $liveName = is_string($row->live_name) ? $row->live_name : '';
                $snapshotName = is_string($row->snapshot_name) ? $row->snapshot_name : '';
                $nameSource = $liveName !== '' ? $liveName : $snapshotName;
                $slug = is_string($row->live_slug) && $row->live_slug !== ''
                    ? $row->live_slug
                    : (is_string($row->snapshot_slug) && $row->snapshot_slug !== '' ? $row->snapshot_slug : null);
                $variants = ($variantRows->get($id) ?? collect())
                    ->map(static function (object $variant): array {
                        $title = trim((string) $variant->variant_title);

                        return [
                            'id' => (int) $variant->variant_id,
                            'title' => $title !== '' ? $title : 'Без варианта',
                            'qty' => (int) $variant->qty,
                        ];
                    })
                    ->values()
                    ->all();

                return [
                    'id' => $id,
                    'name' => ProductDisplayName::format(
                        is_string($row->brand_name) ? $row->brand_name : null,
                        $nameSource,
                    ),
                    'slug' => $slug,
                    'qty' => (int) $row->qty,
                    'variants' => $variants,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array{
     *     revenue: string,
     *     cost: string,
     *     product_profit: string,
     *     delivery_expense: string,
     *     net_profit: string
     * }
     */
    public function netProfit(string $from, string $to): array
    {
        $empty = [
            'revenue' => '0.00',
            'cost' => '0.00',
            'product_profit' => '0.00',
            'delivery_expense' => '0.00',
            'net_profit' => '0.00',
        ];

        if (! $this->tablesReady()) {
            return $empty;
        }

        $row = DB::table('dashboard_daily_finance')
            ->whereBetween('sold_on', [$from, $to])
            ->selectRaw('COALESCE(SUM(revenue), 0) as revenue')
            ->selectRaw('COALESCE(SUM(cost), 0) as cost')
            ->selectRaw('COALESCE(SUM(delivery_expense), 0) as delivery_expense')
            ->first();

        $revenue = MoneyDecimal::normalize($row->revenue ?? 0);
        $cost = MoneyDecimal::normalize($row->cost ?? 0);
        $delivery = MoneyDecimal::normalize($row->delivery_expense ?? 0);
        $productProfit = bcsub($revenue, $cost, 2);
        $netProfit = bcsub($productProfit, $delivery, 2);

        return [
            'revenue' => $revenue,
            'cost' => $cost,
            'product_profit' => $productProfit,
            'delivery_expense' => $delivery,
            'net_profit' => $netProfit,
        ];
    }

    public function period(): DashboardSalesPeriod
    {
        return $this->period;
    }

    /**
     * @param  array<int, string>|null  $preloadedLotPrices
     * @param  array<int, list<array{lot_id: int, qty: int, price: string|null}>>|null  $preloadedAllocationsByItemId
     */
    private function applyOrder(
        Order $order,
        ?array $preloadedLotPrices = null,
        ?array $preloadedAllocationsByItemId = null,
    ): void {
        $this->reverseOrder((int) $order->id);
        $this->hydrateItemAllocations($order, $preloadedAllocationsByItemId);

        $contribution = $this->calculator->fromOrder(
            $order,
            $this->lotPricesForOrder($order, $preloadedLotPrices),
        );
        $rate = $this->bynRateString();
        $lines = [];
        foreach ($contribution['lines'] as $line) {
            $line['cost'] = OrderSaleContributionCalculator::ueToByn($line['cost'], $rate);
            $lines[] = $line;
        }
        $contribution['lines'] = $lines;
        $soldOn = $this->soldOn($order);

        $revenue = '0.00';
        $cost = '0.00';
        foreach ($contribution['lines'] as $line) {
            $revenue = bcadd($revenue, $line['revenue'], 2);
            $cost = bcadd($cost, $line['cost'], 2);
            $this->addDailyProduct($soldOn, $line, 1);
        }
        $this->addDailyFinance($soldOn, $revenue, $cost, $contribution['delivery_expense'], 1);

        DB::table('dashboard_sold_orders')->insert([
            'order_id' => (int) $order->id,
            'sold_on' => $soldOn,
            'delivery_expense' => $contribution['delivery_expense'],
            'lines' => json_encode($contribution['lines'], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function reverseOrder(int $orderId): void
    {
        if ($orderId <= 0) {
            return;
        }

        $snapshot = DB::table('dashboard_sold_orders')->where('order_id', $orderId)->first();
        if ($snapshot === null) {
            return;
        }

        $lines = json_decode((string) $snapshot->lines, true);
        if (! is_array($lines)) {
            $lines = [];
        }

        $revenue = '0.00';
        $cost = '0.00';
        foreach ($lines as $line) {
            if (! is_array($line)) {
                continue;
            }
            $normalized = [
                'product_id' => (int) ($line['product_id'] ?? 0),
                'variant_id' => (int) ($line['variant_id'] ?? 0),
                'product_name' => (string) ($line['product_name'] ?? ''),
                'product_slug' => isset($line['product_slug']) && is_string($line['product_slug']) ? $line['product_slug'] : null,
                'variant_title' => (string) ($line['variant_title'] ?? ''),
                'qty' => (int) ($line['qty'] ?? 0),
                'revenue' => MoneyDecimal::normalize($line['revenue'] ?? 0),
                'cost' => MoneyDecimal::normalize($line['cost'] ?? 0),
            ];
            $revenue = bcadd($revenue, $normalized['revenue'], 2);
            $cost = bcadd($cost, $normalized['cost'], 2);
            $this->addDailyProduct((string) $snapshot->sold_on, $normalized, -1);
        }
        $this->addDailyFinance(
            (string) $snapshot->sold_on,
            $revenue,
            $cost,
            MoneyDecimal::normalize($snapshot->delivery_expense ?? 0),
            -1,
        );

        DB::table('dashboard_sold_orders')->where('order_id', $orderId)->delete();
    }

    /**
     * @param  array{
     *     product_id: int,
     *     variant_id: int,
     *     product_name: string,
     *     product_slug: string|null,
     *     variant_title: string,
     *     qty: int,
     *     revenue: string,
     *     cost: string
     * }  $line
     */
    private function addDailyProduct(string $soldOn, array $line, int $sign): void
    {
        $qtyDelta = $sign * (int) $line['qty'];
        $revenueDelta = $sign < 0
            ? bcmul($line['revenue'], '-1', 2)
            : $line['revenue'];
        $costDelta = $sign < 0
            ? bcmul($line['cost'], '-1', 2)
            : $line['cost'];

        $existing = DB::table('dashboard_daily_product_sales')
            ->where('sold_on', $soldOn)
            ->where('product_id', $line['product_id'])
            ->where('variant_id', $line['variant_id'])
            ->first();

        if ($existing) {
            $nextQty = max(0, (int) $existing->qty + $qtyDelta);
            $nextRevenue = $this->nonNegativeMoney(bcadd((string) $existing->revenue, $revenueDelta, 2));
            $nextCost = $this->nonNegativeMoney(bcadd((string) $existing->cost, $costDelta, 2));

            if ($nextQty === 0 && MoneyDecimal::compare($nextRevenue, '0.00') === 0 && MoneyDecimal::compare($nextCost, '0.00') === 0) {
                DB::table('dashboard_daily_product_sales')->where('id', $existing->id)->delete();

                return;
            }

            DB::table('dashboard_daily_product_sales')->where('id', $existing->id)->update([
                'qty' => $nextQty,
                'revenue' => $nextRevenue,
                'cost' => $nextCost,
                'product_name' => $line['product_name'] !== '' ? $line['product_name'] : $existing->product_name,
                'product_slug' => $line['product_slug'] ?? $existing->product_slug,
                'variant_title' => $line['variant_title'] !== '' ? $line['variant_title'] : $existing->variant_title,
                'updated_at' => now(),
            ]);

            return;
        }

        if ($sign < 0) {
            return;
        }

        try {
            DB::table('dashboard_daily_product_sales')->insert([
                'sold_on' => $soldOn,
                'product_id' => $line['product_id'],
                'variant_id' => $line['variant_id'],
                'product_name' => $line['product_name'] !== '' ? $line['product_name'] : null,
                'product_slug' => $line['product_slug'],
                'variant_title' => $line['variant_title'] !== '' ? $line['variant_title'] : null,
                'qty' => max(0, $qtyDelta),
                'revenue' => $this->nonNegativeMoney($revenueDelta),
                'cost' => $this->nonNegativeMoney($costDelta),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            $this->addDailyProduct($soldOn, $line, $sign);
        }
    }

    private function addDailyFinance(string $soldOn, string $revenue, string $cost, string $delivery, int $sign): void
    {
        $revenueDelta = $sign < 0 ? bcmul($revenue, '-1', 2) : $revenue;
        $costDelta = $sign < 0 ? bcmul($cost, '-1', 2) : $cost;
        $deliveryDelta = $sign < 0 ? bcmul($delivery, '-1', 2) : $delivery;
        $ordersDelta = $sign;

        $existing = DB::table('dashboard_daily_finance')->where('sold_on', $soldOn)->first();
        if ($existing) {
            $nextOrders = max(0, (int) $existing->orders_count + $ordersDelta);
            $nextRevenue = $this->nonNegativeMoney(bcadd((string) $existing->revenue, $revenueDelta, 2));
            $nextCost = $this->nonNegativeMoney(bcadd((string) $existing->cost, $costDelta, 2));
            $nextDelivery = $this->nonNegativeMoney(bcadd((string) $existing->delivery_expense, $deliveryDelta, 2));

            if ($nextOrders === 0
                && MoneyDecimal::compare($nextRevenue, '0.00') === 0
                && MoneyDecimal::compare($nextCost, '0.00') === 0
                && MoneyDecimal::compare($nextDelivery, '0.00') === 0
            ) {
                DB::table('dashboard_daily_finance')->where('id', $existing->id)->delete();

                return;
            }

            DB::table('dashboard_daily_finance')->where('id', $existing->id)->update([
                'revenue' => $nextRevenue,
                'cost' => $nextCost,
                'delivery_expense' => $nextDelivery,
                'orders_count' => $nextOrders,
                'updated_at' => now(),
            ]);

            return;
        }

        if ($sign < 0) {
            return;
        }

        try {
            DB::table('dashboard_daily_finance')->insert([
                'sold_on' => $soldOn,
                'revenue' => $this->nonNegativeMoney($revenueDelta),
                'cost' => $this->nonNegativeMoney($costDelta),
                'delivery_expense' => $this->nonNegativeMoney($deliveryDelta),
                'orders_count' => max(0, $ordersDelta),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            $this->addDailyFinance($soldOn, $revenue, $cost, $delivery, $sign);
        }
    }

    /**
     * @param  array<int, string>|null  $preloaded
     * @return array<int, string>
     */
    private function lotPricesForOrder(Order $order, ?array $preloaded = null): array
    {
        $prices = $this->normalizePriceMap($preloaded ?? []);

        foreach ($order->items as $item) {
            $allocations = is_array($item->stock_lot_allocations) ? $item->stock_lot_allocations : [];
            foreach ($allocations as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $lotId = (int) ($row['lot_id'] ?? 0);
                if ($lotId <= 0 || isset($prices[$lotId])) {
                    continue;
                }
                if (isset($row['price']) && $row['price'] !== null && $row['price'] !== '') {
                    $prices[$lotId] = MoneyDecimal::normalize($row['price']);
                }
            }
        }

        if ($preloaded === null) {
            foreach ($this->lotPricesFromReservations((int) $order->id) as $lotId => $price) {
                if (! isset($prices[$lotId])) {
                    $prices[$lotId] = $price;
                }
            }
        }

        $missingLotIds = [];
        foreach ($order->items as $item) {
            $allocations = is_array($item->stock_lot_allocations) ? $item->stock_lot_allocations : [];
            foreach ($allocations as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $lotId = (int) ($row['lot_id'] ?? 0);
                if ($lotId > 0 && ! isset($prices[$lotId])) {
                    $missingLotIds[$lotId] = true;
                }
            }
        }

        if ($missingLotIds === []) {
            return $prices;
        }

        $fromLots = WarehouseStockLot::query()
            ->whereIn('id', array_keys($missingLotIds))
            ->pluck('supplier_price', 'id');

        foreach ($fromLots as $lotId => $price) {
            if ($price === null || $price === '') {
                continue;
            }
            $prices[(int) $lotId] = MoneyDecimal::normalize($price);
        }

        return $prices;
    }

    private function soldOn(Order $order): string
    {
        if ($order->shipment_date) {
            return $order->shipment_date->format('Y-m-d');
        }

        return $order->created_at
            ? $order->created_at->copy()->timezone(DashboardSalesPeriod::TIMEZONE)->toDateString()
            : now(DashboardSalesPeriod::TIMEZONE)->toDateString();
    }

    private function bynRateString(): string
    {
        $rate = MoneyDecimal::normalize($this->bynRate->get());
        if (MoneyDecimal::compare($rate, '0.00') <= 0) {
            return '1.00';
        }

        return $rate;
    }

    /**
     * @param  iterable<int, object>  $orders
     * @return array{0: array<int, array<int, string>>, 1: array<int, list<array{lot_id: int, qty: int, price: string|null}>>}
     */
    private function preloadReservationCosts(iterable $orders): array
    {
        $orderIds = [];
        foreach ($orders as $order) {
            $orderIds[] = (int) $order->id;
        }
        if ($orderIds === []) {
            return [[], []];
        }

        $rows = DB::table('stock_reservations')
            ->whereIn('order_id', $orderIds)
            ->orderBy('id')
            ->get(['order_id', 'order_item_id', 'status', 'payload']);

        $pricesByOrder = [];
        $allocationsByItemId = [];
        foreach ($rows as $row) {
            $orderId = (int) $row->order_id;
            $itemId = (int) $row->order_item_id;
            $writtenOff = (string) $row->status === 'written_off';
            foreach ($this->lotsFromPayload($row->payload) as $lot) {
                $lotId = $lot['lot_id'];
                if ($lot['price'] !== null && (! isset($pricesByOrder[$orderId][$lotId]) || $writtenOff)) {
                    $pricesByOrder[$orderId][$lotId] = $lot['price'];
                }
                if ($itemId > 0 && $lot['qty'] > 0) {
                    $allocationsByItemId[$itemId][] = $lot;
                }
            }
        }

        return [$pricesByOrder, $allocationsByItemId];
    }

    /**
     * @param  array<int, list<array{lot_id: int, qty: int, price: string|null}>>  $allocationsByItemId
     * @return array<int, list<array{lot_id: int, qty: int, price: string|null}>>
     */
    private function allocationsForOrder(Order $order, array $allocationsByItemId): array
    {
        $out = [];
        foreach ($order->items as $item) {
            $itemId = (int) $item->id;
            if (isset($allocationsByItemId[$itemId])) {
                $out[$itemId] = $allocationsByItemId[$itemId];
            }
        }

        return $out;
    }

    /**
     * @param  array<int, list<array{lot_id: int, qty: int, price: string|null}>>|null  $preloadedAllocationsByItemId
     */
    private function hydrateItemAllocations(Order $order, ?array $preloadedAllocationsByItemId = null): void
    {
        $byItem = $preloadedAllocationsByItemId ?? $this->reservationAllocationsByItemId((int) $order->id);

        foreach ($order->items as $item) {
            $current = is_array($item->stock_lot_allocations) ? $item->stock_lot_allocations : [];
            if ($current !== []) {
                continue;
            }
            $extra = $byItem[(int) $item->id] ?? [];
            if ($extra !== []) {
                $item->setAttribute('stock_lot_allocations', $extra);
            }
        }
    }

    /**
     * @return array<int, string>
     */
    private function lotPricesFromReservations(int $orderId): array
    {
        if ($orderId <= 0) {
            return [];
        }

        $rows = DB::table('stock_reservations')
            ->where('order_id', $orderId)
            ->orderBy('id')
            ->get(['status', 'payload']);

        $prices = [];
        foreach ($rows as $row) {
            $writtenOff = (string) $row->status === 'written_off';
            foreach ($this->lotsFromPayload($row->payload) as $lot) {
                if ($lot['price'] === null) {
                    continue;
                }
                if (! isset($prices[$lot['lot_id']]) || $writtenOff) {
                    $prices[$lot['lot_id']] = $lot['price'];
                }
            }
        }

        return $prices;
    }

    /**
     * @return array<int, list<array{lot_id: int, qty: int, price: string|null}>>
     */
    private function reservationAllocationsByItemId(int $orderId): array
    {
        if ($orderId <= 0) {
            return [];
        }

        $rows = DB::table('stock_reservations')
            ->where('order_id', $orderId)
            ->orderBy('id')
            ->get(['order_item_id', 'payload']);

        $out = [];
        foreach ($rows as $row) {
            $itemId = (int) $row->order_item_id;
            if ($itemId <= 0) {
                continue;
            }
            foreach ($this->lotsFromPayload($row->payload) as $lot) {
                if ($lot['qty'] > 0) {
                    $out[$itemId][] = $lot;
                }
            }
        }

        return $out;
    }

    /**
     * @return list<array{lot_id: int, qty: int, price: string|null}>
     */
    private function lotsFromPayload(mixed $payload): array
    {
        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            $payload = is_array($decoded) ? $decoded : [];
        }
        if (! is_array($payload)) {
            return [];
        }

        $lots = $payload['lots'] ?? [];
        if (! is_array($lots)) {
            return [];
        }

        $out = [];
        foreach ($lots as $row) {
            if (! is_array($row)) {
                continue;
            }
            $lotId = (int) ($row['lot_id'] ?? 0);
            $qty = max(0, (int) ($row['qty'] ?? 0));
            if ($lotId <= 0 || $qty <= 0) {
                continue;
            }
            $price = null;
            if (isset($row['price']) && $row['price'] !== null && $row['price'] !== '') {
                $price = MoneyDecimal::normalize($row['price']);
            }
            $out[] = [
                'lot_id' => $lotId,
                'qty' => $qty,
                'price' => $price,
            ];
        }

        return $out;
    }

    /**
     * @param  array<int|string, mixed>  $raw
     * @return array<int, string>
     */
    private function normalizePriceMap(array $raw): array
    {
        $prices = [];
        foreach ($raw as $lotId => $price) {
            $id = (int) $lotId;
            if ($id <= 0 || $price === null || $price === '') {
                continue;
            }
            $prices[$id] = MoneyDecimal::normalize($price);
        }

        return $prices;
    }

    private function nonNegativeMoney(string $value): string
    {
        $normalized = MoneyDecimal::normalize($value);

        return MoneyDecimal::compare($normalized, '0.00') < 0 ? '0.00' : $normalized;
    }

    private function tablesReady(): bool
    {
        static $ready = null;
        if ($ready === true) {
            return true;
        }

        $ready = Schema::hasTable('dashboard_sold_orders')
            && Schema::hasTable('dashboard_daily_product_sales')
            && Schema::hasTable('dashboard_daily_finance');

        return $ready;
    }
}
