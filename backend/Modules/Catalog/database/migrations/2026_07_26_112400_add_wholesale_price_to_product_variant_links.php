<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->decimal('wholesale_price', 12, 2)->nullable()->after('old_price');
        });
    }

    public function down(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->dropColumn('wholesale_price');
        });
    }
};
