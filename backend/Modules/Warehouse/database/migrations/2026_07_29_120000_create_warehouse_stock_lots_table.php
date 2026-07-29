<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Warehouse\Models\StockReceipt;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouse_stock_lots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variant_links')->cascadeOnDelete();
            $table->foreignId('stock_receipt_item_id')
                ->nullable()
                ->constrained('stock_receipt_items')
                ->nullOnDelete();
            $table->decimal('supplier_price', 12, 2)->nullable();
            $table->unsignedInteger('qty')->default(0);
            $table->unsignedInteger('reserved_qty')->default(0);
            $table->string('supplier_sku')->nullable();
            $table->string('supplier_name')->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->index(['warehouse_id', 'variant_id'], 'wsl_warehouse_variant_idx');
            $table->index(['variant_id', 'supplier_price'], 'wsl_variant_price_idx');
            $table->index(['warehouse_id', 'variant_id', 'qty'], 'wsl_warehouse_variant_qty_idx');
        });

        $this->backfillLotsFromReceipts();
    }

    public function down(): void
    {
        Schema::dropIfExists('warehouse_stock_lots');
    }

    /**
     * LIFO: покрываем текущий остаток warehouse_variant_stocks последними posted-строками прихода.
     */
    private function backfillLotsFromReceipts(): void
    {
        $stocks = DB::table('warehouse_variant_stocks')
            ->where('stock', '>', 0)
            ->orderBy('id')
            ->get(['id', 'warehouse_id', 'product_id', 'variant_id', 'stock', 'reserved_stock']);

        $now = now();

        foreach ($stocks as $stock) {
            $remaining = (int) $stock->stock;
            if ($remaining <= 0) {
                continue;
            }

            $receiptItems = DB::table('stock_receipt_items as sri')
                ->join('stock_receipts as sr', 'sr.id', '=', 'sri.stock_receipt_id')
                ->where('sr.status', StockReceipt::STATUS_POSTED)
                ->where('sr.warehouse_id', (int) $stock->warehouse_id)
                ->where('sri.variant_id', (int) $stock->variant_id)
                ->orderByDesc('sr.received_at')
                ->orderByDesc('sr.id')
                ->orderByDesc('sri.id')
                ->get([
                    'sri.id',
                    'sri.qty',
                    'sri.supplier_price',
                    'sri.supplier_sku',
                    'sri.payload',
                    'sr.supplier_name',
                ]);

            $lots = [];
            foreach ($receiptItems as $item) {
                if ($remaining <= 0) {
                    break;
                }
                $itemQty = max(0, (int) ($item->qty ?? 0));
                if ($itemQty <= 0) {
                    continue;
                }
                $take = min($remaining, $itemQty);
                $payload = is_string($item->payload) ? json_decode($item->payload, true) : $item->payload;
                $payload = is_array($payload) ? $payload : [];
                $comment = trim((string) ($payload['comment'] ?? ''));

                $lots[] = [
                    'warehouse_id' => (int) $stock->warehouse_id,
                    'product_id' => (int) $stock->product_id,
                    'variant_id' => (int) $stock->variant_id,
                    'stock_receipt_item_id' => (int) $item->id,
                    'supplier_price' => $item->supplier_price,
                    'qty' => $take,
                    'reserved_qty' => 0,
                    'supplier_sku' => $item->supplier_sku,
                    'supplier_name' => $item->supplier_name,
                    'comment' => $comment !== '' ? $comment : null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
                $remaining -= $take;
            }

            if ($remaining > 0) {
                $lots[] = [
                    'warehouse_id' => (int) $stock->warehouse_id,
                    'product_id' => (int) $stock->product_id,
                    'variant_id' => (int) $stock->variant_id,
                    'stock_receipt_item_id' => null,
                    'supplier_price' => null,
                    'qty' => $remaining,
                    'reserved_qty' => 0,
                    'supplier_sku' => null,
                    'supplier_name' => null,
                    'comment' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            // Распределяем reserved_stock по лотам (с дешёвых / без цены — с конца LIFO).
            $reservedLeft = max(0, (int) $stock->reserved_stock);
            for ($i = count($lots) - 1; $i >= 0 && $reservedLeft > 0; $i--) {
                $avail = (int) $lots[$i]['qty'];
                $take = min($avail, $reservedLeft);
                $lots[$i]['reserved_qty'] = $take;
                $reservedLeft -= $take;
            }

            if ($lots !== []) {
                DB::table('warehouse_stock_lots')->insert($lots);
            }
        }
    }
};
