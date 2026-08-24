<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_daily_wishlists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->date('wished_on');
            $table->unsignedInteger('wishlists_count')->default(0);
            $table->timestamps();

            $table->unique(['product_id', 'wished_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_daily_wishlists');
    }
};
