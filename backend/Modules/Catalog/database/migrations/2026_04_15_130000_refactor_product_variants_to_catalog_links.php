<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('variant_definitions', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('volume_ml');
            $table->string('concentration_code', 50);
            $table->string('concentration_label', 120);
            $table->boolean('is_tester')->default(false);
            $table->string('title', 255);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['volume_ml', 'concentration_code', 'is_tester'], 'variant_definition_lookup_idx');
            $table->unique(['volume_ml', 'concentration_code', 'is_tester'], 'variant_definition_unique');
        });

        Schema::create('product_variant_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_definition_id')->constrained('variant_definitions')->cascadeOnDelete();
            $table->decimal('price', 12, 2)->nullable();
            $table->decimal('old_price', 12, 2)->nullable();
            $table->integer('stock')->default(0);
            $table->boolean('is_preorder')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['product_id', 'variant_definition_id'], 'product_variant_link_unique');
            $table->index(['product_id', 'is_active', 'sort_order'], 'product_variant_link_product_idx');
        });

        if (Schema::hasTable('supplier_variant_offers')) {
            Schema::table('supplier_variant_offers', function (Blueprint $table) {
                $table->dropForeign(['product_variant_id']);
                $table->foreign('product_variant_id')
                    ->references('id')
                    ->on('product_variant_links')
                    ->cascadeOnDelete();
            });
        }

        if (Schema::hasTable('cart_items')) {
            Schema::table('cart_items', function (Blueprint $table) {
                $table->dropForeign(['variant_id']);
                $table->foreign('variant_id')
                    ->references('id')
                    ->on('product_variant_links')
                    ->cascadeOnDelete();
            });
        }

        Schema::dropIfExists('product_variants');
    }

    public function down(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('volume')->nullable();
            $table->string('volume_unit', 20)->nullable();
            $table->string('type', 100)->nullable();
            $table->string('concentration', 50)->nullable();
            $table->string('edition', 100)->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->decimal('old_price', 12, 2)->nullable();
            $table->integer('stock')->default(0);
            $table->boolean('is_preorder')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        if (Schema::hasTable('supplier_variant_offers')) {
            Schema::table('supplier_variant_offers', function (Blueprint $table) {
                $table->dropForeign(['product_variant_id']);
                $table->foreign('product_variant_id')
                    ->references('id')
                    ->on('product_variants')
                    ->cascadeOnDelete();
            });
        }

        if (Schema::hasTable('cart_items')) {
            Schema::table('cart_items', function (Blueprint $table) {
                $table->dropForeign(['variant_id']);
                $table->foreign('variant_id')
                    ->references('id')
                    ->on('product_variants')
                    ->cascadeOnDelete();
            });
        }

        Schema::dropIfExists('product_variant_links');
        Schema::dropIfExists('variant_definitions');
    }
};
