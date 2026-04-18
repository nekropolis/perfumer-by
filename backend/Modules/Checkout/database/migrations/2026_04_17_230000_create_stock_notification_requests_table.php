<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_notification_requests', function (Blueprint $table) {
            $table->id();

            // Тип запроса: back_in_stock — «сообщить о появлении», callback — «заказать звонок».
            // Разные сценарии, но одна таблица: упрощает админский журнал обращений.
            $table->string('kind', 32)->default('back_in_stock');

            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('product_id')->nullable();
            $table->unsignedBigInteger('variant_id')->nullable();

            // Snapshot fields so request keeps meaning if product/variant is removed.
            $table->string('product_name')->nullable();
            $table->string('variant_title')->nullable();

            $table->string('phone', 32);
            $table->text('comment')->nullable();

            $table->string('status', 32)->default('new');
            $table->timestamp('notified_at')->nullable();

            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 512)->nullable();

            $table->timestamps();

            $table->index('kind');
            $table->index('user_id');
            $table->index('product_id');
            $table->index('variant_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_notification_requests');
    }
};
