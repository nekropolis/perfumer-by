<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('import_retry_queue', function (Blueprint $table): void {
            $table->id();
            $table->string('task_type', 64);
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('status', 20)->default('pending');
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('last_attempt_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->unique(['task_type', 'product_id']);
            $table->index(['task_type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('import_retry_queue');
    }
};
