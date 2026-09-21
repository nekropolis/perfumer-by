<?php

namespace Modules\Checkout\Services\Dashboard;

use Modules\Catalog\Support\MoneyDecimal;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;

/**
 * Вклад выполненного заказа в агрегаты дашборда.
 *
 * Выручка строки = total (цена витрины со скидкой товара / акцией)
 * минус доля скидки накопительной карты.
 * Себестоимость = цена входа партии или supplier_purchase_price.
 */
final class OrderSaleContributionCalculator
{
    /**
     * @param  array<int, string>  $lotPrices  lot_id => цена входа
     * @return array{
     *     delivery_expense: string,
     *     lines: list<array{
     *         product_id: int,
     *         variant_id: int,
     *         product_name: string,
     *         product_slug: string|null,
     *         variant_title: string,
     *         qty: int,
     *         revenue: string,
     *         cost: string
     *     }>
     * }
     */
    public function fromOrder(Order $order, array $lotPrices = []): array
    {
        $items = [];
        foreach ($order->items as $item) {
            if (! $item instanceof OrderItem) {
                continue;
            }
            $items[] = $this->itemPayload($item);
        }

        return $this->fromPayload(
            MoneyDecimal::normalize($order->discount_amount ?? 0),
            MoneyDecimal::normalize($order->delivery_fee ?? 0),
            $items,
            $lotPrices,
        );
    }

    /**
     * @param  list<array{
     *     product_id: int,
     *     variant_id: int,
     *     product_name: string,
     *     product_slug: string|null,
     *     variant_title: string,
     *     qty: int,
     *     total: string,
     *     supplier_purchase_price: string|null,
     *     stock_lot_allocations: list<array{lot_id: int, qty: int}>|null
     * }>  $items
     * @param  array<int, string>  $lotPrices
     * @return array{
     *     delivery_expense: string,
     *     lines: list<array{
     *         product_id: int,
     *         variant_id: int,
     *         product_name: string,
     *         product_slug: string|null,
     *         variant_title: string,
     *         qty: int,
     *         revenue: string,
     *         cost: string
     *     }>
     * }
     */
    public function fromPayload(
        string $discountAmount,
        string $deliveryFee,
        array $items,
        array $lotPrices = [],
    ): array {
        $subtotal = '0.00';
        foreach ($items as $item) {
            $subtotal = bcadd($subtotal, MoneyDecimal::normalize($item['total'] ?? 0), 2);
        }

        $discount = MoneyDecimal::normalize($discountAmount);
        if (MoneyDecimal::compare($discount, $subtotal) > 0) {
            $discount = $subtotal;
        }

        $remainingDiscount = $discount;
        $lastIndex = count($items) - 1;
        $lines = [];

        foreach ($items as $index => $item) {
            $qty = max(0, (int) ($item['qty'] ?? 0));
            $lineTotal = MoneyDecimal::normalize($item['total'] ?? 0);
            $share = '0.00';
            if (MoneyDecimal::compare($discount, '0.00') > 0 && MoneyDecimal::compare($subtotal, '0.00') > 0) {
                if ($index === $lastIndex) {
                    $share = $remainingDiscount;
                } else {
                    $ratio = bcdiv($lineTotal, $subtotal, 8);
                    $share = bcmul($discount, $ratio, 2);
                    $remainingDiscount = bcsub($remainingDiscount, $share, 2);
                }
            }

            $revenue = bcsub($lineTotal, $share, 2);
            if (MoneyDecimal::compare($revenue, '0.00') < 0) {
                $revenue = '0.00';
            }

            $lines[] = [
                'product_id' => max(0, (int) ($item['product_id'] ?? 0)),
                'variant_id' => max(0, (int) ($item['variant_id'] ?? 0)),
                'product_name' => (string) ($item['product_name'] ?? ''),
                'product_slug' => isset($item['product_slug']) && is_string($item['product_slug']) && $item['product_slug'] !== ''
                    ? $item['product_slug']
                    : null,
                'variant_title' => (string) ($item['variant_title'] ?? ''),
                'qty' => $qty,
                'revenue' => $revenue,
                'cost' => $this->lineCost($item, $qty, $lotPrices),
            ];
        }

        return [
            'delivery_expense' => MoneyDecimal::normalize($deliveryFee),
            'lines' => $lines,
        ];
    }

    public static function ueToByn(string $ue, string $rate): string
    {
        $rateNorm = MoneyDecimal::normalize($rate);
        if (MoneyDecimal::compare($rateNorm, '0.00') <= 0) {
            $rateNorm = '1.00';
        }

        return bcmul(MoneyDecimal::normalize($ue), $rateNorm, 2);
    }

    /**
     * @param  array{
     *     supplier_purchase_price?: string|null,
     *     stock_lot_allocations?: list<array{lot_id: int, qty: int}>|null
     * }  $item
     * @param  array<int, string>  $lotPrices
     */
    private function lineCost(array $item, int $qty, array $lotPrices): string
    {
        if ($qty <= 0) {
            return '0.00';
        }

        $unitPurchase = isset($item['supplier_purchase_price']) && $item['supplier_purchase_price'] !== null
            ? MoneyDecimal::normalize($item['supplier_purchase_price'])
            : '0.00';

        $allocations = $item['stock_lot_allocations'] ?? null;
        if (! is_array($allocations) || $allocations === []) {
            return bcmul($unitPurchase, (string) $qty, 2);
        }

        $cost = '0.00';
        $covered = 0;
        foreach ($allocations as $allocation) {
            if (! is_array($allocation)) {
                continue;
            }
            $lotId = (int) ($allocation['lot_id'] ?? 0);
            $lotQty = max(0, (int) ($allocation['qty'] ?? 0));
            if ($lotId <= 0 || $lotQty <= 0 || $covered >= $qty) {
                continue;
            }
            $take = min($lotQty, $qty - $covered);
            $price = $unitPurchase;
            if (isset($allocation['price']) && $allocation['price'] !== null && $allocation['price'] !== '') {
                $price = MoneyDecimal::normalize($allocation['price']);
            } elseif (isset($lotPrices[$lotId])) {
                $price = MoneyDecimal::normalize($lotPrices[$lotId]);
            }
            $cost = bcadd($cost, bcmul($price, (string) $take, 2), 2);
            $covered += $take;
        }

        $remaining = $qty - $covered;
        if ($remaining > 0) {
            $cost = bcadd($cost, bcmul($unitPurchase, (string) $remaining, 2), 2);
        }

        return $cost;
    }

    /**
     * @return array{
     *     product_id: int,
     *     variant_id: int,
     *     product_name: string,
     *     product_slug: string|null,
     *     variant_title: string,
     *     qty: int,
     *     total: string,
     *     supplier_purchase_price: string|null,
     *     stock_lot_allocations: list<array{lot_id: int, qty: int}>|null
     * }
     */
    private function itemPayload(OrderItem $item): array
    {
        $allocations = is_array($item->stock_lot_allocations) ? $item->stock_lot_allocations : null;
        $normalized = null;
        if (is_array($allocations)) {
            $normalized = [];
            foreach ($allocations as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $lotId = (int) ($row['lot_id'] ?? 0);
                $qty = (int) ($row['qty'] ?? 0);
                if ($lotId <= 0 || $qty <= 0) {
                    continue;
                }
                $normalized[] = ['lot_id' => $lotId, 'qty' => $qty];
            }
            if ($normalized === []) {
                $normalized = null;
            }
        }

        return [
            'product_id' => (int) ($item->product_id ?? 0),
            'variant_id' => (int) ($item->variant_id ?? 0),
            'product_name' => (string) $item->product_name,
            'product_slug' => $item->product_slug !== null && $item->product_slug !== ''
                ? (string) $item->product_slug
                : null,
            'variant_title' => (string) $item->variant_title,
            'qty' => (int) $item->qty,
            'total' => MoneyDecimal::normalize($item->total),
            'supplier_purchase_price' => $item->supplier_purchase_price !== null
                ? MoneyDecimal::normalize($item->supplier_purchase_price)
                : null,
            'stock_lot_allocations' => $normalized,
        ];
    }
}
