<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_seo_generations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('active_product_id')->nullable()->constrained('products')->cascadeOnDelete();
            $table->uuid('external_job_id')->nullable()->unique();
            $table->string('status', 30)->default('pending');
            $table->string('external_status', 30)->nullable();
            $table->json('requested_fields');
            $table->json('source_snapshot');
            $table->string('source_hash', 64);
            $table->json('result')->nullable();
            $table->text('error')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('deadline_at');
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->unique('active_product_id');
            $table->index(['product_id', 'status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_seo_generations');
    }
};
