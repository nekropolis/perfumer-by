<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('legacy_map_brands')) {
            Schema::create('legacy_map_brands', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('legacy_manufacturer_id')->unique();
                $table->string('legacy_slug', 500)->nullable();
                $table->unsignedBigInteger('brand_id')->nullable()->index();
                $table->string('status', 32)->default('unmatched')->index();
                $table->string('match_method', 64)->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('legacy_map_products')) {
            Schema::create('legacy_map_products', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('legacy_product_id')->unique();
                $table->string('legacy_slug', 500)->nullable();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->string('status', 32)->default('unmatched')->index();
                $table->string('match_method', 64)->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('legacy_unmatched_products')) {
            Schema::create('legacy_unmatched_products', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('legacy_product_id')->unique();
                $table->string('legacy_slug', 500)->nullable();
                $table->string('legacy_name', 500)->nullable();
                $table->longText('legacy_description')->nullable();
                $table->text('legacy_meta_title')->nullable();
                $table->text('legacy_meta_description')->nullable();
                $table->text('legacy_meta_keyword')->nullable();
                $table->json('legacy_reviews')->nullable();
                $table->string('status', 32)->default('unmatched')->index();
                $table->text('skip_reason')->nullable();
                $table->unsignedBigInteger('linked_product_id')->nullable()->index();
                $table->unsignedBigInteger('redirect_id')->nullable()->index();
                $table->unsignedBigInteger('linked_by_user_id')->nullable()->index();
                $table->timestamp('linked_at')->nullable();
                $table->json('sync_snapshot')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('legacy_map_reviews')) {
            Schema::create('legacy_map_reviews', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('legacy_review_id')->unique();
                $table->unsignedBigInteger('legacy_product_id')->default(0)->index();
                $table->unsignedBigInteger('review_id')->nullable()->index();
                $table->string('status', 64)->index();
                $table->string('type', 32)->nullable()->index();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('seo_redirects')) {
            Schema::create('seo_redirects', function (Blueprint $table): void {
                $table->id();
                $table->string('from_path', 500)->unique();
                $table->string('to_path', 500)->nullable();
                $table->unsignedSmallInteger('http_code')->default(301)->index();
                $table->boolean('is_active')->default(true)->index();
                $table->string('source', 64)->default('manual')->index();
                $table->string('legacy_entity_type', 32)->nullable()->index();
                $table->unsignedBigInteger('legacy_entity_id')->nullable()->index();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('seo_redirects');
        Schema::dropIfExists('legacy_map_reviews');
        Schema::dropIfExists('legacy_unmatched_products');
        Schema::dropIfExists('legacy_map_products');
        Schema::dropIfExists('legacy_map_brands');
    }
};
