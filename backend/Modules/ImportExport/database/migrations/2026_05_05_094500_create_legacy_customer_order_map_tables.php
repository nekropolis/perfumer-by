<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('legacy_map_customers')) {
            Schema::create('legacy_map_customers', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('legacy_customer_id')->unique();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('status', 32)->default('unmatched')->index();
                $table->string('match_method', 64)->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('legacy_map_orders')) {
            Schema::create('legacy_map_orders', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('legacy_order_id')->unique();
                $table->unsignedBigInteger('legacy_customer_id')->default(0)->index();
                $table->unsignedBigInteger('order_id')->nullable()->index();
                $table->string('status', 32)->default('unmatched')->index();
                $table->string('match_method', 64)->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('legacy_map_orders');
        Schema::dropIfExists('legacy_map_customers');
    }
};

