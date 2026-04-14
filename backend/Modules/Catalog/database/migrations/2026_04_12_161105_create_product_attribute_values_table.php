<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_attribute_values', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('product_attribute_id');

            $table->foreign('product_id', 'pav_product_id_fk')
                ->references('id')
                ->on('products')
                ->cascadeOnDelete();

            $table->foreign('product_attribute_id', 'pav_product_attribute_id_fk')
                ->references('id')
                ->on('product_attributes')
                ->cascadeOnDelete();

            $table->text('custom_value')->nullable();

            $table->unsignedInteger('sort_order')->default(0);

            $table->timestamps();

            $table->unique(['product_id', 'product_attribute_id']);
            $table->index(['product_id', 'sort_order']);
            $table->index(['product_attribute_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_attribute_values');
    }
};
