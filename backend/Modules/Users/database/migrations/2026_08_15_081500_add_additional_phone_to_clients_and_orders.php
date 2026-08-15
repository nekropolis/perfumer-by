<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            if (! Schema::hasColumn('clients', 'additional_phone')) {
                $table->string('additional_phone', 32)->nullable()->after('phone');
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'additional_phone')) {
                $table->string('additional_phone', 32)->nullable()->after('phone');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'additional_phone')) {
                $table->dropColumn('additional_phone');
            }
        });

        Schema::table('clients', function (Blueprint $table) {
            if (Schema::hasColumn('clients', 'additional_phone')) {
                $table->dropColumn('additional_phone');
            }
        });
    }
};
