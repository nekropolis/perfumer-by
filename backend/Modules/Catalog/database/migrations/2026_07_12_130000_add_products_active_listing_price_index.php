<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->index(
                ['product_id', 'is_active', 'is_preorder'],
                'pvl_product_listing_stock_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->dropIndex('pvl_product_listing_stock_idx');
        });
    }
};
