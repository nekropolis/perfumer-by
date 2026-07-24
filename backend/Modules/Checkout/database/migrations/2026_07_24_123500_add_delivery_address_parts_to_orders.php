<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('delivery_street_prefix', 32)->nullable()->after('delivery_address');
            $table->string('delivery_house', 32)->nullable()->after('delivery_street_prefix');
            $table->string('delivery_korpus', 32)->nullable()->after('delivery_house');
            $table->string('delivery_apartment', 32)->nullable()->after('delivery_korpus');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'delivery_street_prefix',
                'delivery_house',
                'delivery_korpus',
                'delivery_apartment',
            ]);
        });
    }
};
