<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_variant_offers', function (Blueprint $table) {
            $table->id();

            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();

            $table->string('external_product_url')->nullable();
            $table->string('external_product_name')->nullable();
            $table->string('external_variant_name')->nullable();

            $table->string('external_id')->nullable()->index(); // article/id у поставщика
            $table->string('sku')->nullable()->index();

            $table->decimal('price', 12, 2);
            $table->decimal('old_price', 12, 2)->nullable();
            $table->decimal('purchase_price', 12, 2)->nullable();

            $table->integer('stock')->default(0);
            $table->boolean('is_preorder')->default(false);
            $table->boolean('is_active')->default(true);

            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();

            $table->json('payload')->nullable();
            $table->timestamps();

            $table->unique(
                ['supplier_id', 'product_variant_id', 'external_id'],
                'supplier_variant_external_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_variant_offers');
    }
};

