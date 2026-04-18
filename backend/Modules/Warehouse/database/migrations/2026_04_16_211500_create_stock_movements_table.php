<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->string('type', 30);
            $table->string('document_type', 50)->nullable();
            $table->unsignedBigInteger('document_id')->nullable();
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variant_links')->cascadeOnDelete();
            $table->integer('stock_delta')->default(0);
            $table->integer('reserved_delta')->default(0);
            $table->unsignedInteger('stock_before')->default(0);
            $table->unsignedInteger('stock_after')->default(0);
            $table->unsignedInteger('reserved_before')->default(0);
            $table->unsignedInteger('reserved_after')->default(0);
            $table->json('payload')->nullable();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamps();

            $table->index(['variant_id', 'created_at']);
            $table->index(['document_type', 'document_id']);
            $table->index(['type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
