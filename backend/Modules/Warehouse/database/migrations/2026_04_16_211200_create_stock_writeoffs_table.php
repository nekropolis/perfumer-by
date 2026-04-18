<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_writeoffs', function (Blueprint $table) {
            $table->id();
            $table->string('document_no', 50)->nullable()->unique();
            $table->string('type', 30)->default('manual');
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->string('status', 30)->default('posted');
            $table->timestamp('written_off_at')->nullable();
            $table->text('comment')->nullable();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->unsignedBigInteger('updated_by')->nullable()->index();
            $table->timestamps();

            $table->index(['type', 'written_off_at']);
            $table->index(['status', 'written_off_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_writeoffs');
    }
};
