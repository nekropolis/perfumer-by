<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->index(['product_id', 'is_active'], 'pvl_product_active_idx');
        });

        Schema::table('product_attribute_values', function (Blueprint $table) {
            $table->index(['product_attribute_id', 'product_id'], 'pav_attribute_product_idx');
        });
    }

    public function down(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->dropIndex('pvl_product_active_idx');
        });

        Schema::table('product_attribute_values', function (Blueprint $table) {
            $table->dropIndex('pav_attribute_product_idx');
        });
    }
};
