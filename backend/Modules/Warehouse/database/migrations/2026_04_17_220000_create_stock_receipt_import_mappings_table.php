<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_receipt_import_mappings', function (Blueprint $table) {
            $table->id();
            $table->string('supplier_sku', 100)->nullable()->index();
            $table->string('source_title', 500)->nullable()->index();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variant_links')->cascadeOnDelete();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->index(['supplier_sku', 'variant_id'], 'stock_receipt_import_mapping_sku_variant_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_receipt_import_mappings');
    }
};

