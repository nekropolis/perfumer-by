<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->boolean('is_discontinued')->default(false)->after('is_promotion');
            $table->foreignId('replacement_variant_id')
                ->nullable()
                ->after('is_discontinued')
                ->constrained('product_variant_links')
                ->nullOnDelete();
            $table->index(['is_discontinued', 'replacement_variant_id'], 'product_variant_link_discontinued_idx');
        });
    }

    public function down(): void
    {
        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->dropIndex('product_variant_link_discontinued_idx');
            $table->dropConstrainedForeignId('replacement_variant_id');
            $table->dropColumn('is_discontinued');
        });
    }
};
