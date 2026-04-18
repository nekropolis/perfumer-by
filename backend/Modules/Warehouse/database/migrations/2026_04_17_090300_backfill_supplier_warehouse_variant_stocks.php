<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $supplierWarehouseId = (int) DB::table('warehouses')->where('code', 'supplier')->value('id');
        if ($supplierWarehouseId <= 0) {
            return;
        }

        $variants = DB::table('product_variant_links')
            ->select(['id', 'product_id', 'stock', 'reserved_stock'])
            ->get();

        foreach ($variants as $variant) {
            $stock = max(0, (int) ($variant->stock ?? 0));
            $reserved = max(0, (int) ($variant->reserved_stock ?? 0));

            if ($stock === 0 && $reserved === 0) {
                continue;
            }

            DB::table('warehouse_variant_stocks')->updateOrInsert(
                [
                    'warehouse_id' => $supplierWarehouseId,
                    'variant_id' => (int) $variant->id,
                ],
                [
                    'product_id' => (int) $variant->product_id,
                    'stock' => $stock,
                    'reserved_stock' => $reserved,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }
    }

    public function down(): void
    {
        $supplierWarehouseId = (int) DB::table('warehouses')->where('code', 'supplier')->value('id');
        if ($supplierWarehouseId <= 0) {
            return;
        }

        DB::table('warehouse_variant_stocks')->where('warehouse_id', $supplierWarehouseId)->delete();
    }
};
