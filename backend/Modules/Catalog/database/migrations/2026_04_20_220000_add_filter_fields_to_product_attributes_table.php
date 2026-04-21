<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_attributes', function (Blueprint $table) {
            $table->boolean('is_filterable')->default(false)->after('is_active');
            $table->unsignedInteger('filter_sort_order')->default(0)->after('is_filterable');
            $table->index(['is_filterable', 'filter_sort_order'], 'product_attributes_filter_sort_idx');
        });
    }

    public function down(): void
    {
        Schema::table('product_attributes', function (Blueprint $table) {
            $table->dropIndex('product_attributes_filter_sort_idx');
            $table->dropColumn(['is_filterable', 'filter_sort_order']);
        });
    }
};
