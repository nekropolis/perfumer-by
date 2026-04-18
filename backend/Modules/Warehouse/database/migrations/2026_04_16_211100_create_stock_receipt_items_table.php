<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_receipt_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_receipt_id')->constrained('stock_receipts')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variant_links')->cascadeOnDelete();
            $table->string('product_name', 255);
            $table->string('variant_title', 255);
            $table->unsignedInteger('qty');
            $table->decimal('supplier_price', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
            $table->string('supplier_sku', 100)->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['variant_id', 'created_at']);
            $table->index(['product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_receipt_items');
    }
};
