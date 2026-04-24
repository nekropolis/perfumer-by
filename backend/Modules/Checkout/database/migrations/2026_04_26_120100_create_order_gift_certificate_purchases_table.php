<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_gift_certificate_purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('template_id')->constrained('gift_certificate_templates')->restrictOnDelete();
            $table->string('template_title', 255);
            $table->decimal('amount', 12, 2);
            $table->unsignedInteger('qty')->default(1);
            $table->decimal('total', 12, 2);
            $table->timestamp('created_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_gift_certificate_purchases');
    }
};
