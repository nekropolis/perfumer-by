<?php

namespace Modules\ImportExport\Services\Legacy;

use App\Support\Phone;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;
use Throwable;

final class LegacyOrdersImportService
{
    public function __construct(
        private readonly LegacyVeterCityMatcher $cityMatcher,
        private readonly LegacyRemoteMysqlClient $legacyMysql,
    ) {}

    /**
     * @return array{
     *     after_order_id: int,
     *     fetched: int,
     *     skipped: int,
     *     imported: int,
     *     failed: int,
     *     city_matched: int,
     *     city_unmatched: int,
     *     card_matched: int,
     *     with_manager_comment: int
     * }
     */
    public function importIncremental(): array
    {
        $afterId = (int) (DB::table('legacy_map_orders')->max('legacy_order_id') ?? 0);

        $orders = $this->legacyMysql->select(
            'SELECT * FROM `oc_order` WHERE `order_id` > '.(int) $afterId
            .' AND `order_status_id` > 0 ORDER BY `order_id`'
        );

        if ($orders->isEmpty()) {
            return $this->emptyStats($afterId);
        }

        return $this->importOrderRows($orders, $afterId);
    }

    /**
     * Импорт конкретных legacy order_id (без cursor), только status > 0.
     *
     * @param  list<int>  $legacyOrderIds
     * @return array{
     *     after_order_id: int,
     *     fetched: int,
     *     skipped: int,
     *     imported: int,
     *     failed: int,
     *     city_matched: int,
     *     city_unmatched: int,
     *     card_matched: int,
     *     with_manager_comment: int
     * }
     */
    public function importLegacyOrderIds(array $legacyOrderIds): array
    {
        $ids = array_values(array_unique(array_filter(
            array_map(static fn ($id): int => (int) $id, $legacyOrderIds),
            static fn (int $id): bool => $id > 0
        )));
        if ($ids === []) {
            return $this->emptyStats(0);
        }

        $in = implode(',', $ids);
        $orders = $this->legacyMysql->select(
            "SELECT * FROM `oc_order` WHERE `order_id` IN ({$in}) AND `order_status_id` > 0 ORDER BY `order_id`"
        );

        return $this->importOrderRows($orders, 0, skipIfMapped: false);
    }

    /**
     * @param  Collection<int, object>  $orders
     * @return array{
     *     after_order_id: int,
     *     fetched: int,
     *     skipped: int,
     *     imported: int,
     *     failed: int,
     *     city_matched: int,
     *     city_unmatched: int,
     *     card_matched: int,
     *     with_manager_comment: int
     * }
     */
    private function importOrderRows(Collection $orders, int $afterId, bool $skipIfMapped = true): array
    {
        if ($orders->isEmpty()) {
            return $this->emptyStats($afterId);
        }

        $orderIds = $orders->pluck('order_id')->map(static fn ($id): int => (int) $id)->all();

        $orderProducts = $this->legacyMysql->selectWhereIn('oc_order_product', 'order_id', $orderIds);
        $orderTotals = $this->legacyMysql->selectWhereIn('oc_order_total', 'order_id', $orderIds);
        $orderOptions = $this->legacyMysql->selectWhereIn('oc_order_option', 'order_id', $orderIds);

        $productsByOrder = [];
        foreach ($orderProducts as $item) {
            $orderId = (int) ($item->order_id ?? 0);
            if ($orderId <= 0) {
                continue;
            }
            $productsByOrder[$orderId][] = (array) $item;
        }

        /** @var array<int, list<array<string, mixed>>> $totalsRowsByOrder */
        $totalsRowsByOrder = [];
        foreach ($orderTotals as $row) {
            $orderId = (int) ($row->order_id ?? 0);
            if ($orderId <= 0) {
                continue;
            }
            $totalsRowsByOrder[$orderId][] = (array) $row;
        }

        /** @var array<int, array<int, list<array{name: string, value: string}>>> $optionsByOrderProduct */
        $optionsByOrderProduct = [];
        foreach ($orderOptions as $opt) {
            $orderProductId = (int) ($opt->order_product_id ?? 0);
            $orderId = (int) ($opt->order_id ?? 0);
            if ($orderProductId <= 0 || $orderId <= 0) {
                continue;
            }
            $name = trim((string) ($opt->name ?? ''));
            $value = trim((string) ($opt->value ?? ''));
            if ($name === '' && $value === '') {
                continue;
            }
            $optionsByOrderProduct[$orderId][$orderProductId][] = [
                'name' => $name,
                'value' => $value,
            ];
        }

        $productMap = DB::table('legacy_map_products')
            ->whereNotNull('product_id')
            ->pluck('product_id', 'legacy_product_id')
            ->all();
        $catalogProductsById = Product::query()
            ->with('brand:id,name')
            ->whereIn('id', array_values(array_unique(array_map(static fn ($id): int => (int) $id, $productMap))))
            ->get()
            ->keyBy('id');
        $customerMap = DB::table('legacy_map_customers')
            ->whereNotNull('client_id')
            ->pluck('client_id', 'legacy_customer_id')
            ->all();

        $skipped = 0;
        $imported = 0;
        $failed = 0;
        $cityMatched = 0;
        $cityUnmatched = 0;
        $cardMatched = 0;
        $withManagerComment = 0;

        foreach ($orders as $legacyOrder) {
            $legacyOrderId = (int) ($legacyOrder->order_id ?? 0);
            if ($legacyOrderId <= 0) {
                continue;
            }

            if ($skipIfMapped) {
                $mappedOrderId = DB::table('legacy_map_orders')
                    ->where('legacy_order_id', $legacyOrderId)
                    ->value('order_id');
                if ($mappedOrderId !== null) {
                    $skipped++;
                    continue;
                }
            } else {
                // При принудительном импорте map уже должен быть очищен; на всякий случай пропускаем живой map.
                $mappedOrderId = DB::table('legacy_map_orders')
                    ->where('legacy_order_id', $legacyOrderId)
                    ->whereNotNull('order_id')
                    ->value('order_id');
                if ($mappedOrderId !== null) {
                    $skipped++;
                    continue;
                }
            }

            $legacyCustomerId = (int) ($legacyOrder->customer_id ?? 0);
            $clientId = isset($customerMap[$legacyCustomerId]) ? (int) $customerMap[$legacyCustomerId] : null;

            $customerName = trim(((string) ($legacyOrder->firstname ?? '')).' '.((string) ($legacyOrder->lastname ?? '')));
            if ($customerName === '') {
                $customerName = 'Покупатель';
            }
            $phone = $this->normalizePhone((string) ($legacyOrder->telephone ?? ''));
            if ($phone === '') {
                $phone = '+000000000';
            }

            $itemRows = $productsByOrder[$legacyOrderId] ?? [];
            $totalRows = $totalsRowsByOrder[$legacyOrderId] ?? [];
            $totalsByCode = $this->totalsByCode($totalRows);
            $subtotal = $totalsByCode['sub_total'] ?? (string) ($legacyOrder->total ?? '0');
            $deliveryFee = $totalsByCode['shipping'] ?? '0';
            $total = $totalsByCode['total'] ?? (string) ($legacyOrder->total ?? '0');
            $itemsQty = 0;
            foreach ($itemRows as $item) {
                $itemsQty += max(1, (int) ($item['quantity'] ?? 1));
            }

            $cityResolved = $this->cityMatcher->resolve(
                (string) ($legacyOrder->shipping_city ?? ''),
                (string) ($legacyOrder->shipping_method ?? ''),
            );
            if ($cityResolved['city_matched']) {
                $cityMatched++;
            } elseif (trim((string) ($legacyOrder->shipping_city ?? '')) !== '') {
                $cityUnmatched++;
            }

            $discount = LegacyOrderImportExtras::resolveDiscountFromTotals($totalRows);
            if ($discount['discount_card_id'] !== null || $discount['discount_card_number'] !== null) {
                $cardMatched++;
            }

            $managerComment = LegacyOrderImportExtras::buildManagerComment(
                $itemRows,
                $optionsByOrderProduct[$legacyOrderId] ?? [],
            );
            if ($managerComment !== null) {
                $withManagerComment++;
            }

            try {
                DB::beginTransaction();

                $createdAt = $this->normalizeDateTime((string) ($legacyOrder->date_added ?? ''))
                    ?? now()->format('Y-m-d H:i:s');
                $updatedAt = $this->normalizeDateTime((string) ($legacyOrder->date_modified ?? ''))
                    ?? $createdAt;
                $deliveryDate = substr($createdAt, 0, 10);

                $orderId = (int) DB::table('orders')->insertGetId([
                    'client_id' => $clientId,
                    'cart_token' => null,
                    'customer_name' => $customerName,
                    'phone' => mb_substr($phone, 0, 32),
                    'comment' => $this->nullableString((string) ($legacyOrder->comment ?? '')),
                    'manager_comment' => $managerComment,
                    'delivery_method' => $cityResolved['delivery_method'],
                    'delivery_city' => $cityResolved['delivery_city'],
                    'delivery_city_id' => $cityResolved['delivery_city_id'],
                    'delivery_address' => $this->composeDeliveryAddress((array) $legacyOrder),
                    'delivery_date' => $deliveryDate,
                    'delivery_fee' => $this->asMoneyString($deliveryFee),
                    'payment_method' => $this->nullableString(mb_substr((string) ($legacyOrder->payment_method ?? ''), 0, 32)),
                    'status' => 'new',
                    'items_qty' => $itemsQty,
                    'subtotal' => $this->asMoneyString($subtotal),
                    'total' => $this->asMoneyString($total),
                    'discount_card_id' => $discount['discount_card_id'],
                    'discount_card_number' => $discount['discount_card_number'],
                    'discount_percent_snapshot' => $discount['discount_percent_snapshot'],
                    'discount_amount' => $discount['discount_amount'],
                    'created_at' => $createdAt,
                    'updated_at' => $updatedAt,
                ]);

                $itemInsert = [];
                foreach ($itemRows as $item) {
                    $legacyProductId = (int) ($item['product_id'] ?? 0);
                    $mappedProductId = isset($productMap[$legacyProductId]) ? (int) $productMap[$legacyProductId] : null;
                    $name = trim((string) ($item['name'] ?? ''));
                    $model = trim((string) ($item['model'] ?? ''));
                    $variantTitle = $model !== '' ? $model : ($name !== '' ? $name : 'Вариант');

                    $catalogProduct = $mappedProductId ? $catalogProductsById->get($mappedProductId) : null;
                    $productName = $catalogProduct
                        ? ProductDisplayName::forProduct($catalogProduct)
                        : ($name !== '' ? $name : 'Товар');
                    $brandName = $catalogProduct?->brand?->name;

                    $qty = max(1, (int) ($item['quantity'] ?? 1));
                    $price = $this->asMoneyString((string) ($item['price'] ?? '0'));
                    $lineTotal = $this->asMoneyString((string) ($item['total'] ?? (string) (round((float) $price * $qty, 2))));

                    $itemInsert[] = [
                        'order_id' => $orderId,
                        'product_id' => $mappedProductId,
                        'variant_id' => null,
                        'product_name' => $productName,
                        'product_slug' => $catalogProduct?->slug,
                        'brand_name' => $brandName !== null && $brandName !== '' ? $brandName : null,
                        'variant_title' => $variantTitle,
                        'sku' => $model !== '' ? mb_substr($model, 0, 255) : null,
                        'qty' => $qty,
                        'price' => $price,
                        'total' => $lineTotal,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
                if ($itemInsert !== []) {
                    DB::table('order_items')->insert($itemInsert);
                }

                DB::table('legacy_map_orders')->upsert(
                    [[
                        'legacy_order_id' => $legacyOrderId,
                        'legacy_customer_id' => $legacyCustomerId,
                        'order_id' => $orderId,
                        'status' => 'imported',
                        'match_method' => 'legacy_order_id',
                        'note' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['legacy_order_id'],
                    ['legacy_customer_id', 'order_id', 'status', 'match_method', 'note', 'updated_at']
                );

                DB::commit();
                $imported++;
            } catch (Throwable $e) {
                DB::rollBack();
                DB::table('legacy_map_orders')->upsert(
                    [[
                        'legacy_order_id' => $legacyOrderId,
                        'legacy_customer_id' => $legacyCustomerId,
                        'order_id' => null,
                        'status' => 'failed',
                        'match_method' => null,
                        'note' => mb_substr($e->getMessage(), 0, 1800),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['legacy_order_id'],
                    ['legacy_customer_id', 'order_id', 'status', 'match_method', 'note', 'updated_at']
                );
                $failed++;
            }
        }

        return [
            'after_order_id' => $afterId,
            'fetched' => $orders->count(),
            'skipped' => $skipped,
            'imported' => $imported,
            'failed' => $failed,
            'city_matched' => $cityMatched,
            'city_unmatched' => $cityUnmatched,
            'card_matched' => $cardMatched,
            'with_manager_comment' => $withManagerComment,
        ];
    }

    /**
     * @return array{
     *     after_order_id: int,
     *     fetched: int,
     *     skipped: int,
     *     imported: int,
     *     failed: int,
     *     city_matched: int,
     *     city_unmatched: int,
     *     card_matched: int,
     *     with_manager_comment: int
     * }
     */
    private function emptyStats(int $afterId): array
    {
        return [
            'after_order_id' => $afterId,
            'fetched' => 0,
            'skipped' => 0,
            'imported' => 0,
            'failed' => 0,
            'city_matched' => 0,
            'city_unmatched' => 0,
            'card_matched' => 0,
            'with_manager_comment' => 0,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $totalRows
     * @return array<string, string>
     */
    private function totalsByCode(array $totalRows): array
    {
        $out = [];
        foreach ($totalRows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            if ($code === '') {
                continue;
            }
            $out[$code] = (string) ($row['value'] ?? '0');
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $legacyOrder
     */
    private function composeDeliveryAddress(array $legacyOrder): ?string
    {
        $parts = [
            trim((string) ($legacyOrder['shipping_address_1'] ?? '')),
            trim((string) ($legacyOrder['shipping_address_2'] ?? '')),
            trim((string) ($legacyOrder['shipping_city'] ?? '')),
            trim((string) ($legacyOrder['shipping_postcode'] ?? '')),
        ];
        $parts = array_values(array_filter($parts, static fn (string $v): bool => $v !== ''));

        return $parts === [] ? null : implode(', ', $parts);
    }

    private function normalizePhone(string $phone): string
    {
        $digits = Phone::normalizeBelarusDigits($phone);

        return $digits !== '' ? $digits : '';
    }

    private function nullableString(string $value): ?string
    {
        $value = trim($value);

        return $value === '' ? null : $value;
    }

    private function asMoneyString(string $value): string
    {
        $num = is_numeric($value) ? (string) $value : '0';

        return number_format((float) $num, 2, '.', '');
    }

    private function normalizeDateTime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '' || $value === '0000-00-00 00:00:00') {
            return null;
        }

        return $value;
    }
}
