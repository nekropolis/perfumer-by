<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attribute_options', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('attribute_id');

            $table->foreign('attribute_id', 'ao_attr_id_fk')
                ->references('id')
                ->on('attributes')
                ->cascadeOnDelete();

            $table->string('name');

            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['attribute_id', 'is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_options');
    }
};
