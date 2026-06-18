<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('listing_min_price', 12, 2)->nullable()->after('is_out_of_stock');
            $table->index(['is_active', 'listing_min_price', 'name'], 'products_active_listing_price_name_idx');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex('products_active_listing_price_name_idx');
            $table->dropColumn('listing_min_price');
        });
    }
};
