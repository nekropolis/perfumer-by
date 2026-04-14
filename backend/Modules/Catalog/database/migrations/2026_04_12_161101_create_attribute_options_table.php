<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_attribute_options', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('product_attribute_id');

            $table->foreign('product_attribute_id', 'ao_attr_id_fk')
                ->references('id')
                ->on('product_attributes')
                ->cascadeOnDelete();

            $table->string('name');

            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(
                ['product_attribute_id', 'is_active', 'sort_order'],
                'pao_attr_active_sort_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_attribute_options');
    }
};
