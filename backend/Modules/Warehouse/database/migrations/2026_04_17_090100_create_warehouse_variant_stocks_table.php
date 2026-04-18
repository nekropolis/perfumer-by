<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouse_variant_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variant_links')->cascadeOnDelete();
            $table->unsignedInteger('stock')->default(0);
            $table->unsignedInteger('reserved_stock')->default(0);
            $table->timestamps();

            $table->unique(['warehouse_id', 'variant_id'], 'warehouse_variant_stock_unique');
            $table->index(['warehouse_id', 'product_id']);
            $table->index(['variant_id', 'stock']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warehouse_variant_stocks');
    }
};
