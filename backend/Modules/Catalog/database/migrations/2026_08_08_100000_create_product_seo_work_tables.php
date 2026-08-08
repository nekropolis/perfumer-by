<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_seo_batches', function (Blueprint $table) {
            $table->id();
            $table->string('external_batch_id')->nullable()->index();
            $table->string('status', 30)->default('pending');
            $table->unsignedInteger('requested_count')->default(0);
            $table->unsignedInteger('accepted_count')->default(0);
            $table->unsignedInteger('queued_count')->default(0);
            $table->unsignedInteger('applied_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->boolean('force')->default(false);
            $table->json('response')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'id']);
        });

        Schema::create('product_seo_batch_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_seo_batch_id')->constrained('product_seo_batches')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('external_id', 64);
            $table->json('requested_fields');
            $table->string('status', 30)->default('submitted');
            $table->json('result')->nullable();
            $table->json('applied_fields')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->unique(['product_seo_batch_id', 'product_id']);
            $table->index(['product_id', 'status']);
            $table->index(['external_id', 'status']);
        });

        Schema::create('product_seo_field_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('field', 40);
            $table->string('value_hash', 64);
            $table->foreignId('product_seo_batch_item_id')->nullable()->constrained('product_seo_batch_items')->nullOnDelete();
            $table->timestamp('received_at');
            $table->timestamps();

            $table->unique(['product_id', 'field']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_seo_field_receipts');
        Schema::dropIfExists('product_seo_batch_items');
        Schema::dropIfExists('product_seo_batches');
    }
};
