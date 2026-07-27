<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Partial create after failed unique on source_url(1000) under utf8mb4.
        if (Schema::hasTable('allparfume_products') && ! Schema::hasColumn('allparfume_products', 'source_url_hash')) {
            Schema::dropIfExists('allparfume_shop_offers');
            Schema::dropIfExists('allparfume_variants');
            Schema::dropIfExists('allparfume_products');
        }

        if (! Schema::hasTable('allparfume_products')) {
            Schema::create('allparfume_products', function (Blueprint $table): void {
                $table->id();
                $table->string('brand_slug', 191)->index();
                $table->string('brand_name', 191)->nullable();
                $table->string('external_slug', 500);
                // URL itself can be long; uniqueness is by hash (utf8mb4 unique index limit).
                $table->string('source_url', 1000);
                $table->string('source_url_hash', 40)->unique();
                $table->string('title', 500)->nullable();
                $table->string('name', 500)->nullable();
                $table->string('gender_label', 64)->nullable();
                $table->decimal('listing_min_price', 12, 2)->nullable();
                $table->decimal('listing_max_price', 12, 2)->nullable();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->string('match_status', 32)->default('unmatched')->index();
                $table->unsignedSmallInteger('match_confidence')->nullable();
                $table->json('match_payload')->nullable();
                $table->timestamp('last_crawled_at')->nullable();
                $table->json('payload')->nullable();
                $table->timestamps();

                $table->unique(['brand_slug', 'external_slug'], 'allparfume_product_slug_unique');
            });
        }

        if (! Schema::hasTable('allparfume_variants')) {
            Schema::create('allparfume_variants', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('allparfume_product_id')->constrained('allparfume_products')->cascadeOnDelete();
                $table->string('variant_key', 191);
                $table->string('raw_label', 255);
                $table->decimal('volume_ml', 8, 1)->nullable();
                $table->string('concentration_code', 64)->nullable();
                $table->boolean('is_tester')->default(false);
                $table->boolean('is_vial')->default(false);
                $table->boolean('is_miniature')->default(false);
                $table->decimal('min_price', 12, 2)->nullable();
                $table->unsignedBigInteger('product_variant_link_id')->nullable()->index();
                $table->string('match_status', 32)->default('unmatched')->index();
                $table->unsignedSmallInteger('match_confidence')->nullable();
                $table->json('match_payload')->nullable();
                $table->timestamp('last_crawled_at')->nullable();
                $table->json('payload')->nullable();
                $table->timestamps();

                $table->unique(['allparfume_product_id', 'variant_key'], 'allparfume_variant_key_unique');
            });
        }

        if (! Schema::hasTable('allparfume_shop_offers')) {
            Schema::create('allparfume_shop_offers', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('allparfume_product_id')->constrained('allparfume_products')->cascadeOnDelete();
                $table->foreignId('allparfume_variant_id')->nullable()->constrained('allparfume_variants')->nullOnDelete();
                $table->string('shop_key', 191)->index();
                $table->string('shop_name', 191);
                $table->string('shop_url', 1000)->nullable();
                $table->string('offer_url', 1000)->nullable();
                $table->string('offer_url_hash', 64)->nullable();
                $table->decimal('price', 12, 2);
                $table->decimal('old_price', 12, 2)->nullable();
                $table->text('delivery_text')->nullable();
                $table->boolean('is_active')->default(true)->index();
                $table->timestamp('last_seen_at')->nullable();
                $table->json('payload')->nullable();
                $table->timestamps();

                // Same shop outbound URL can repeat across volumes of one product.
                $table->unique(
                    ['allparfume_variant_id', 'shop_key', 'offer_url_hash'],
                    'allparfume_offer_unique'
                );
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('allparfume_shop_offers');
        Schema::dropIfExists('allparfume_variants');
        Schema::dropIfExists('allparfume_products');
    }
};
