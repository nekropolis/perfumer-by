<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_receipt_imports', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('content_hash', 64)->index();
            $table->string('original_filename', 255)->nullable();
            $table->string('file_path', 500)->nullable();
            $table->unsignedBigInteger('warehouse_id')->nullable()->index();
            $table->unsignedBigInteger('supplier_id')->nullable()->index();
            $table->timestamp('received_at')->nullable();
            $table->string('comment', 500)->nullable();
            $table->string('status', 20)->default('open')->index();
            $table->unsignedBigInteger('target_stock_receipt_id')->nullable()->index();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamps();

            $table->index(['content_hash', 'status'], 'stock_receipt_imports_hash_status_idx');
        });

        Schema::create('stock_receipt_import_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('import_id')->constrained('stock_receipt_imports')->cascadeOnDelete();
            $table->string('map_key', 255);
            $table->string('supplier_sku', 100)->nullable()->index();
            $table->string('source_title', 500)->nullable();
            $table->unsignedInteger('qty')->default(0);
            $table->decimal('supplier_price', 12, 2)->nullable();
            $table->unsignedBigInteger('variant_id')->nullable()->index();
            $table->unsignedBigInteger('product_id')->nullable()->index();
            $table->string('resolve_status', 20)->default('pending')->index();
            $table->json('suggestion')->nullable();
            $table->string('receipt_status', 20)->default('pending')->index();
            $table->unsignedBigInteger('stock_receipt_id')->nullable()->index();
            $table->unsignedBigInteger('stock_receipt_item_id')->nullable()->index();
            $table->unsignedBigInteger('linked_by')->nullable();
            $table->unsignedBigInteger('committed_by')->nullable();
            $table->timestamp('committed_at')->nullable();
            $table->timestamps();

            $table->unique(['import_id', 'map_key'], 'stock_receipt_import_rows_import_map_uidx');
            $table->index(['import_id', 'resolve_status'], 'stock_receipt_import_rows_resolve_idx');
            $table->index(['import_id', 'receipt_status'], 'stock_receipt_import_rows_receipt_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_receipt_import_rows');
        Schema::dropIfExists('stock_receipt_imports');
    }
};
