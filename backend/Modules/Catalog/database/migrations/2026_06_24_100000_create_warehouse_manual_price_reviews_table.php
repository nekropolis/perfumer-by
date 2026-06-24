<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouse_manual_price_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')->constrained('product_variant_links')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('reason', 64);
            $table->decimal('warehouse_purchase', 12, 2);
            $table->decimal('supplier_purchase', 12, 2)->nullable();
            $table->foreignId('receipt_supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('supplier_sku', 100)->nullable();
            $table->string('supplier_external_code', 100)->nullable();
            $table->string('product_name', 255);
            $table->string('variant_title', 255);
            $table->decimal('manual_retail_price', 12, 2)->nullable();
            $table->boolean('list_on_storefront')->default(false);
            $table->foreignId('manual_set_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('manual_set_at')->nullable();
            $table->foreignId('price_refresh_run_id')->nullable()->constrained('price_refresh_runs')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['resolved_at', 'variant_id']);
            $table->index(['price_refresh_run_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warehouse_manual_price_reviews');
    }
};
