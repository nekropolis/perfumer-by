<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use App\Support\Phone;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;

class ImportLegacyOrdersCommand extends Command
{
    protected $signature = 'legacy:import-orders
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--dry-run : Do not write into DB}
        {--truncate-map : Truncate legacy_map_orders before import}';

    protected $description = 'Import legacy orders from oc_order + oc_order_product into orders and order_items';

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $dryRun = (bool) $this->option('dry-run');
        $truncateMap = (bool) $this->option('truncate-map');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");
            return self::FAILURE;
        }

        $orders = $this->extractRowsFromInsertTable($dumpPath, 'oc_order');
        if ($orders === []) {
            $this->warn('No oc_order rows found in dump.');
            return self::SUCCESS;
        }
        $orderProducts = $this->extractRowsFromInsertTable($dumpPath, 'oc_order_product');
        $orderTotals = $this->extractRowsFromInsertTable($dumpPath, 'oc_order_total');

        if (! $dryRun && $truncateMap) {
            DB::table('legacy_map_orders')->truncate();
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

        $productsByOrder = [];
        foreach ($orderProducts as $item) {
            $orderId = (int) ($item['order_id'] ?? 0);
            if ($orderId <= 0) {
                continue;
            }
            $productsByOrder[$orderId][] = $item;
        }

        $totalsByOrder = [];
        foreach ($orderTotals as $row) {
            $orderId = (int) ($row['order_id'] ?? 0);
            $code = trim((string) ($row['code'] ?? ''));
            if ($orderId <= 0 || $code === '') {
                continue;
            }
            $totalsByOrder[$orderId][$code] = (string) ($row['value'] ?? '0');
        }

        $processed = 0;
        $created = 0;
        $wouldCreate = 0;
        $skippedExisting = 0;
        $failed = 0;

        foreach ($orders as $legacyOrder) {
            $processed++;
            $legacyOrderId = (int) ($legacyOrder['order_id'] ?? 0);
            if ($legacyOrderId <= 0) {
                continue;
            }

            $mappedOrderId = DB::table('legacy_map_orders')
                ->where('legacy_order_id', $legacyOrderId)
                ->value('order_id');
            if ($mappedOrderId !== null) {
                $skippedExisting++;
                continue;
            }

            $legacyCustomerId = (int) ($legacyOrder['customer_id'] ?? 0);
            $clientId = isset($customerMap[$legacyCustomerId]) ? (int) $customerMap[$legacyCustomerId] : null;

            $customerName = trim(((string) ($legacyOrder['firstname'] ?? '')).' '.((string) ($legacyOrder['lastname'] ?? '')));
            if ($customerName === '') {
                $customerName = 'Покупатель';
            }
            $phone = $this->normalizePhone((string) ($legacyOrder['telephone'] ?? ''));
            if ($phone === '') {
                $phone = '+000000000';
            }

            $orderId = null;
            $itemRows = $productsByOrder[$legacyOrderId] ?? [];
            $totals = $totalsByOrder[$legacyOrderId] ?? [];
            $subtotal = $totals['sub_total'] ?? (string) ($legacyOrder['total'] ?? '0');
            $deliveryFee = $totals['shipping'] ?? '0';
            $total = $totals['total'] ?? (string) ($legacyOrder['total'] ?? '0');
            $itemsQty = 0;
            foreach ($itemRows as $item) {
                $itemsQty += max(1, (int) ($item['quantity'] ?? 1));
            }

            if ($dryRun) {
                $wouldCreate++;
            } else {
                try {
                    DB::beginTransaction();

                    $orderId = (int) DB::table('orders')->insertGetId([
                        'client_id' => $clientId,
                        'cart_token' => null,
                        'customer_name' => $customerName,
                        'phone' => mb_substr($phone, 0, 32),
                        'comment' => $this->nullableString((string) ($legacyOrder['comment'] ?? '')),
                        'delivery_method' => $this->nullableString(mb_substr((string) ($legacyOrder['shipping_method'] ?? ''), 0, 40)),
                        'delivery_city' => $this->nullableString((string) ($legacyOrder['shipping_city'] ?? '')),
                        'delivery_address' => $this->composeDeliveryAddress($legacyOrder),
                        'delivery_date' => substr(
                            $this->normalizeDateTime((string) ($legacyOrder['date_added'] ?? '')) ?? now()->format('Y-m-d H:i:s'),
                            0,
                            10
                        ),
                        'delivery_fee' => $this->asMoneyString($deliveryFee),
                        'payment_method' => $this->nullableString(mb_substr((string) ($legacyOrder['payment_method'] ?? ''), 0, 32)),
                        'status' => 'done',
                        'items_qty' => $itemsQty,
                        'subtotal' => $this->asMoneyString($subtotal),
                        'total' => $this->asMoneyString($total),
                        'created_at' => $this->normalizeDateTime((string) ($legacyOrder['date_added'] ?? '')) ?? now(),
                        'updated_at' => $this->normalizeDateTime((string) ($legacyOrder['date_modified'] ?? '')) ?? now(),
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
                    $created++;
                } catch (\Throwable $e) {
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
        }

        $this->info('Legacy orders import finished.');
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Processed: {$processed}");
        $this->line("Imported orders: {$created}");
        $this->line("Would import (dry-run): {$wouldCreate}");
        $this->line("Skipped existing map: {$skippedExisting}");
        $this->line("Failed: {$failed}");

        return self::SUCCESS;
    }

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
        return Phone::normalizeBelarusDigits($phone);
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

    /**
     * @return list<array<string, mixed>>
     */
    private function extractRowsFromInsertTable(string $dumpPath, string $tableName): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $result = [];
        $prefix = 'INSERT INTO `'.$tableName.'`';
        while (($line = fgets($handle)) !== false) {
            if (! str_starts_with($line, $prefix)) {
                continue;
            }

            $statement = $line;
            $inQuote = false;
            $escaped = false;
            while (! $this->lineEndsSqlStatement($line, $inQuote, $escaped) && ($line = fgets($handle)) !== false) {
                $statement .= $line;
            }

            foreach ($this->parseInsertStatementRows($statement) as $row) {
                $result[] = $row;
            }
        }

        fclose($handle);
        return $result;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function parseInsertStatementRows(string $insertSql): array
    {
        if (preg_match('/^INSERT INTO `[^`]+`\s*\((.+)\)\s*VALUES\s*/is', $insertSql, $colsMatch) !== 1) {
            return [];
        }
        $columns = array_map(
            static fn (string $col): string => trim(str_replace('`', '', $col)),
            array_filter(array_map('trim', explode(',', (string) $colsMatch[1])))
        );
        $valuesPos = stripos($insertSql, 'VALUES');
        if ($valuesPos === false || $columns === []) {
            return [];
        }

        $tuples = $this->splitSqlTuples(substr($insertSql, $valuesPos + 6));
        $result = [];
        foreach ($tuples as $tuple) {
            $fields = $this->splitTupleFields($tuple);
            if (count($fields) !== count($columns)) {
                continue;
            }
            $row = [];
            foreach ($columns as $idx => $column) {
                $row[$column] = $this->unquoteSqlValue(trim($fields[$idx] ?? ''));
            }
            $result[] = $row;
        }
        return $result;
    }

    /**
     * @return list<string>
     */
    private function splitSqlTuples(string $valuesSql): array
    {
        $result = [];
        $buffer = '';
        $depth = 0;
        $inQuote = false;
        $escaped = false;
        $len = strlen($valuesSql);
        for ($i = 0; $i < $len; $i++) {
            $ch = $valuesSql[$i];
            if ($inQuote) {
                $buffer .= $ch;
                if ($escaped) {
                    $escaped = false;
                    continue;
                }
                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }
                if ($ch === "'") {
                    $inQuote = false;
                }
                continue;
            }
            if ($ch === "'") {
                $inQuote = true;
                $buffer .= $ch;
                continue;
            }
            if ($ch === '(') {
                $depth++;
                if ($depth === 1) {
                    $buffer = '';
                    continue;
                }
            }
            if ($ch === ')') {
                if ($depth === 1) {
                    $result[] = $buffer;
                    $buffer = '';
                    $depth = 0;
                    continue;
                }
                $depth = max(0, $depth - 1);
            }
            if ($depth >= 1) {
                $buffer .= $ch;
            }
        }
        return $result;
    }

    /**
     * @return list<string>
     */
    private function splitTupleFields(string $tuple): array
    {
        $fields = [];
        $buffer = '';
        $inQuote = false;
        $escaped = false;
        $len = strlen($tuple);
        for ($i = 0; $i < $len; $i++) {
            $ch = $tuple[$i];
            if ($inQuote) {
                $buffer .= $ch;
                if ($escaped) {
                    $escaped = false;
                    continue;
                }
                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }
                if ($ch === "'") {
                    $inQuote = false;
                }
                continue;
            }
            if ($ch === "'") {
                $inQuote = true;
                $buffer .= $ch;
                continue;
            }
            if ($ch === ',') {
                $fields[] = $buffer;
                $buffer = '';
                continue;
            }
            $buffer .= $ch;
        }
        $fields[] = $buffer;
        return $fields;
    }

    private function lineEndsSqlStatement(string $line, bool &$inQuote, bool &$escaped): bool
    {
        $len = strlen($line);
        for ($i = 0; $i < $len; $i++) {
            $ch = $line[$i];
            if ($inQuote) {
                if ($escaped) {
                    $escaped = false;
                    continue;
                }
                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }
                if ($ch === "'") {
                    $inQuote = false;
                }
                continue;
            }
            if ($ch === "'") {
                $inQuote = true;
                continue;
            }
            if ($ch === ';') {
                return true;
            }
        }
        return false;
    }

    private function unquoteSqlValue(string $value): mixed
    {
        if (strcasecmp($value, 'NULL') === 0) {
            return null;
        }
        if (! str_starts_with($value, "'") || ! str_ends_with($value, "'")) {
            return $value;
        }
        $inner = substr($value, 1, -1);
        $inner = str_replace("\\'", "'", $inner);
        $inner = str_replace('\\\\', '\\', $inner);
        return $inner;
    }
}

