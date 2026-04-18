<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_receipts', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('document_no')->constrained('warehouses')->nullOnDelete();
            $table->index(['warehouse_id', 'received_at']);
        });

        Schema::table('stock_writeoffs', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('document_no')->constrained('warehouses')->nullOnDelete();
            $table->index(['warehouse_id', 'written_off_at']);
        });

        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('order_item_id')->constrained('warehouses')->nullOnDelete();
            $table->index(['warehouse_id', 'status']);
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('order_id')->constrained('warehouses')->nullOnDelete();
            $table->index(['warehouse_id', 'created_at']);
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('warehouse_id')->nullable()->after('entity_id')->index();
        });

        $supplierWarehouseId = (int) DB::table('warehouses')->where('code', 'supplier')->value('id');

        if ($supplierWarehouseId > 0) {
            DB::table('stock_receipts')->whereNull('warehouse_id')->update(['warehouse_id' => $supplierWarehouseId]);
            DB::table('stock_writeoffs')->whereNull('warehouse_id')->update(['warehouse_id' => $supplierWarehouseId]);
            DB::table('stock_reservations')->whereNull('warehouse_id')->update(['warehouse_id' => $supplierWarehouseId]);
            DB::table('stock_movements')->whereNull('warehouse_id')->update(['warehouse_id' => $supplierWarehouseId]);
            DB::table('audit_logs')
                ->whereIn('entity_type', ['stock_receipt', 'stock_writeoff', 'stock_reservation', 'stock_import'])
                ->whereNull('warehouse_id')
                ->update(['warehouse_id' => $supplierWarehouseId]);
        }
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex(['warehouse_id']);
            $table->dropColumn('warehouse_id');
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropIndex(['warehouse_id', 'created_at']);
            $table->dropConstrainedForeignId('warehouse_id');
        });

        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->dropIndex(['warehouse_id', 'status']);
            $table->dropConstrainedForeignId('warehouse_id');
        });

        Schema::table('stock_writeoffs', function (Blueprint $table) {
            $table->dropIndex(['warehouse_id', 'written_off_at']);
            $table->dropConstrainedForeignId('warehouse_id');
        });

        Schema::table('stock_receipts', function (Blueprint $table) {
            $table->dropIndex(['warehouse_id', 'received_at']);
            $table->dropConstrainedForeignId('warehouse_id');
        });
    }
};
