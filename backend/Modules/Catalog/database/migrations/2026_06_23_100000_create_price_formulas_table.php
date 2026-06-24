<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_formulas', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('source_type', 32);
            $table->unsignedBigInteger('source_id');
            $table->decimal('multiplier', 12, 4)->default(1);
            $table->decimal('rub_rate', 12, 4)->default(1);
            $table->decimal('addend', 12, 2)->default(0);
            $table->unsignedTinyInteger('round_precision')->default(0);
            $table->string('variant_rule_mode', 32)->default('apply_to_all');
            $table->json('variant_rules')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['source_type', 'source_id', 'is_active', 'sort_order'], 'price_formulas_source_active_sort_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_formulas');
    }
};
