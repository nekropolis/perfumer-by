<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_id')->constrained()->cascadeOnDelete();

            $table->string('title');
            $table->unsignedInteger('volume')->nullable();
            $table->string('volume_unit', 20)->nullable(); // ml
            $table->string('type', 100)->nullable(); // парфюмерная вода / туалетная вода / гель для душа
            $table->string('concentration', 50)->nullable(); // parfum / edp / edt
            $table->string('edition', 100)->nullable(); // tester / limited edition

            $table->decimal('price', 12, 2)->nullable(); // минимальная цена среди поставщиков
            $table->decimal('old_price', 12, 2)->nullable();
            $table->integer('stock')->default(0); // агрегированный stock

            $table->boolean('is_preorder')->default(false);
            $table->boolean('is_active')->default(true);

            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};
