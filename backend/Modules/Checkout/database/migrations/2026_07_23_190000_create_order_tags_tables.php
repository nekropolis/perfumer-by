<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_tags', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('color', 7)->default('#64748b');
            $table->timestamps();

            $table->unique('name');
        });

        Schema::create('order_order_tag', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('order_tag_id')->constrained('order_tags')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['order_id', 'order_tag_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_order_tag');
        Schema::dropIfExists('order_tags');
    }
};
