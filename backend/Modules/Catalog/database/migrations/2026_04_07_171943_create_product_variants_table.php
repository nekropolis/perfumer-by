<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();

            $table->string('sku')->nullable()->index();
            $table->string('barcode')->nullable()->index();

            $table->string('title'); // 75ml parfum Limited Edition
            $table->unsignedInteger('volume')->nullable(); // 75
            $table->string('volume_unit', 20)->nullable(); // ml
            $table->string('concentration', 50)->nullable(); // parfum
            $table->string('edition', 100)->nullable(); // Limited Edition

            $table->decimal('price', 12, 2);
            $table->decimal('old_price', 12, 2)->nullable();
            $table->decimal('purchase_price', 12, 2)->nullable();

            $table->integer('stock')->default(0);
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
