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
            $table->date('delivery_date')->nullable()->after('delivery_address');
            $table->index('delivery_date');
        });

        DB::table('orders')
            ->whereNull('delivery_date')
            ->update([
                'delivery_date' => DB::raw('DATE(created_at)'),
            ]);
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['delivery_date']);
            $table->dropColumn('delivery_date');
        });
    }
};
