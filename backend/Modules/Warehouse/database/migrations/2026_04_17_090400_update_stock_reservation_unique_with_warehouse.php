<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->dropUnique('stock_reservation_order_item_variant_unique');
            $table->unique(['order_item_id', 'variant_id', 'warehouse_id'], 'stock_reservation_order_item_variant_warehouse_unique');
        });
    }

    public function down(): void
    {
        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->dropUnique('stock_reservation_order_item_variant_warehouse_unique');
            $table->unique(['order_item_id', 'variant_id'], 'stock_reservation_order_item_variant_unique');
        });
    }
};
