<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->string('type', 32);
            $table->foreignId('product_id')->nullable()->constrained('products')->cascadeOnDelete();
            $table->string('name', 120);
            $table->text('body');
            $table->unsignedTinyInteger('stars');
            $table->timestamps();

            $table->index(['type', 'product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};
