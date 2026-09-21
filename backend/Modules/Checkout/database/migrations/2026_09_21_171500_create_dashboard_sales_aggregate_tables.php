<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dashboard_sold_orders', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('order_id')->unique();
            $table->date('sold_on');
            $table->decimal('delivery_expense', 14, 2)->default(0);
            $table->json('lines');
            $table->timestamps();

            $table->index('sold_on');
        });

        Schema::create('dashboard_daily_product_sales', function (Blueprint $table): void {
            $table->id();
            $table->date('sold_on');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id')->default(0);
            $table->string('product_name')->nullable();
            $table->string('product_slug')->nullable();
            $table->string('variant_title')->nullable();
            $table->unsignedInteger('qty')->default(0);
            $table->decimal('revenue', 14, 2)->default(0);
            $table->decimal('cost', 14, 2)->default(0);
            $table->timestamps();

            $table->unique(['sold_on', 'product_id', 'variant_id'], 'dash_daily_sales_day_product_variant_uidx');
            $table->index(['sold_on', 'product_id'], 'dash_daily_sales_day_product_idx');
        });

        Schema::create('dashboard_daily_finance', function (Blueprint $table): void {
            $table->id();
            $table->date('sold_on')->unique();
            $table->decimal('revenue', 14, 2)->default(0);
            $table->decimal('cost', 14, 2)->default(0);
            $table->decimal('delivery_expense', 14, 2)->default(0);
            $table->unsignedInteger('orders_count')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_daily_finance');
        Schema::dropIfExists('dashboard_daily_product_sales');
        Schema::dropIfExists('dashboard_sold_orders');
    }
};
