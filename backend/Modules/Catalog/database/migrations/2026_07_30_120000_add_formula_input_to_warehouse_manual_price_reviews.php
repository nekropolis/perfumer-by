<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_manual_price_reviews', function (Blueprint $table) {
            $table->decimal('formula_input', 12, 4)->nullable()->after('supplier_purchase');
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_manual_price_reviews', function (Blueprint $table) {
            $table->dropColumn('formula_input');
        });
    }
};
