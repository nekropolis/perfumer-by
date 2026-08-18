<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_daily_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->date('viewed_on');
            $table->unsignedInteger('views_count')->default(0);
            $table->timestamps();

            $table->unique(['product_id', 'viewed_on']);
        });

        Schema::create('home_recommended_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedTinyInteger('position');
            $table->timestamps();

            $table->unique('product_id');
            $table->unique('position');
        });

        Schema::create('product_similar_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('similar_product_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedTinyInteger('position');

            $table->unique(['product_id', 'similar_product_id']);
            $table->unique(['product_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_similar_links');
        Schema::dropIfExists('home_recommended_products');
        Schema::dropIfExists('product_daily_views');
    }
};
