<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('additional_delivery_street_prefix', 32)->nullable()->after('delivery_apartment');
            $table->string('additional_delivery_address', 500)->nullable()->after('additional_delivery_street_prefix');
            $table->string('additional_delivery_house', 32)->nullable()->after('additional_delivery_address');
            $table->string('additional_delivery_korpus', 32)->nullable()->after('additional_delivery_house');
            $table->string('additional_delivery_apartment', 32)->nullable()->after('additional_delivery_korpus');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'additional_delivery_street_prefix',
                'additional_delivery_address',
                'additional_delivery_house',
                'additional_delivery_korpus',
                'additional_delivery_apartment',
            ]);
        });
    }
};
