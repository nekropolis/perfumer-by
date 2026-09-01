<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('allparfume_products', function (Blueprint $table): void {
            $table->unsignedBigInteger('external_id')->nullable()->unique()->after('product_id');
        });
    }

    public function down(): void
    {
        Schema::table('allparfume_products', function (Blueprint $table): void {
            $table->dropUnique(['external_id']);
            $table->dropColumn('external_id');
        });
    }
};
