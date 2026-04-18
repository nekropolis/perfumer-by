<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('order_id')->index();
            $table->unsignedBigInteger('order_item_id')->nullable()->index();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variant_links')->cascadeOnDelete();
            $table->unsignedInteger('qty');
            $table->string('status', 30)->default('active');
            $table->timestamp('reserved_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamp('written_off_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
            $table->index(['variant_id', 'status']);
            $table->unique(['order_item_id', 'variant_id'], 'stock_reservation_order_item_variant_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
    }
};
