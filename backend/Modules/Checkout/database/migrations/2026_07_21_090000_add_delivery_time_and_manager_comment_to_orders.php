<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->time('delivery_time_from')->nullable()->after('delivery_address');
            $table->time('delivery_time_to')->nullable()->after('delivery_time_from');
            $table->text('manager_comment')->nullable()->after('comment');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_time_from', 'delivery_time_to', 'manager_comment']);
        });
    }
};
