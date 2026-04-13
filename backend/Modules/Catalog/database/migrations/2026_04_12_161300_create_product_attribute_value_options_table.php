<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_attribute_value_options', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('product_attribute_value_id');
            $table->unsignedBigInteger('attribute_option_id');

            $table->foreign('product_attribute_value_id', 'pavo_pav_id_fk')
                ->references('id')
                ->on('product_attribute_values')
                ->cascadeOnDelete();

            $table->foreign('attribute_option_id', 'pavo_ao_id_fk')
                ->references('id')
                ->on('attribute_options')
                ->cascadeOnDelete();

            $table->timestamps();

            $table->unique([
                'product_attribute_value_id',
                'attribute_option_id',
            ], 'product_attr_value_option_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_attribute_value_options');
    }
};
