<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('cart_token')->nullable()->index();

            $table->string('customer_name')->nullable();
            $table->string('phone', 32);
            $table->text('comment')->nullable();

            $table->string('delivery_method', 40)->nullable();
            $table->string('delivery_city', 255)->nullable();
            $table->text('delivery_address')->nullable();
            $table->decimal('delivery_fee', 12, 2)->default(0);
            $table->string('payment_method', 32)->nullable();
            $table->unsignedBigInteger('gift_certificate_id')->nullable()->index();
            $table->string('gift_certificate_code', 64)->nullable();
            $table->decimal('gift_certificate_amount', 12, 2)->default(0);

            $table->string('status')->default('new');
            $table->unsignedInteger('items_qty')->default(0);
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);

            $table->timestamps();

            $table->index('user_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
