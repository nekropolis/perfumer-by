<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->date('shipment_date')->nullable()->after('delivery_address');
            $table->index('shipment_date');
        });

        DB::table('orders')->update([
            'shipment_date' => DB::raw('delivery_date'),
        ]);

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['delivery_date']);
            $table->dropColumn('delivery_date');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->date('delivery_date')->nullable()->after('shipment_date');
            $table->index('delivery_date');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['delivery_date']);
            $table->dropColumn('delivery_date');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->date('delivery_date')->nullable()->after('delivery_address');
            $table->index('delivery_date');
        });

        DB::table('orders')->update([
            'delivery_date' => DB::raw('shipment_date'),
        ]);

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['shipment_date']);
            $table->dropColumn('shipment_date');
        });
    }
};
