<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->index(['is_active', 'brand_id'], 'products_active_brand_idx');
        });

        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->index(['product_id', 'price'], 'pvl_product_price_idx');
        });

        Schema::table('supplier_products', function (Blueprint $table) {
            $table->index(
                ['product_id', 'supplier_id', 'is_linked', 'is_active', 'link_parsing_active'],
                'supplier_products_active_link_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex('products_active_brand_idx');
        });

        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->dropIndex('pvl_product_price_idx');
        });

        Schema::table('supplier_products', function (Blueprint $table) {
            $table->dropIndex('supplier_products_active_link_idx');
        });
    }
};
