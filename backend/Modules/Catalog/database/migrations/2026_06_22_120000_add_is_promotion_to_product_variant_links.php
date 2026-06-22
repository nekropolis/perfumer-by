<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->boolean('is_promotion')->default(false)->after('is_active');
            $table->index(['is_promotion', 'is_active'], 'product_variant_link_promotion_idx');
        });
    }

    public function down(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->dropIndex('product_variant_link_promotion_idx');
            $table->dropColumn('is_promotion');
        });
    }
};
