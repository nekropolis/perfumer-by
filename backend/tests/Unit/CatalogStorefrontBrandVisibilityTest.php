<?php

namespace Tests\Unit;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\CatalogProductQueryFilters;
use Tests\TestCase;

class CatalogStorefrontBrandVisibilityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        config()->set('services.catalog_search.enabled', false);

        Schema::create('brands', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('product_variant_links', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('product_variant_links');
            Schema::dropIfExists('products');
            Schema::dropIfExists('brands');
        }

        parent::tearDown();
    }

    public function test_storefront_brands_exclude_brands_without_active_variants(): void
    {
        $now = now();

        $withVariantId = DB::table('brands')->insertGetId([
            'name' => 'With Variant',
            'slug' => 'with-variant',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $withoutVariantId = DB::table('brands')->insertGetId([
            'name' => 'Without Variant',
            'slug' => 'without-variant',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $emptyBrandId = DB::table('brands')->insertGetId([
            'name' => 'Empty',
            'slug' => 'empty',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $productWithVariantId = DB::table('products')->insertGetId([
            'brand_id' => $withVariantId,
            'name' => 'Product A',
            'slug' => 'product-a',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('products')->insert([
            'brand_id' => $withoutVariantId,
            'name' => 'Product B',
            'slug' => 'product-b',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('product_variant_links')->insert([
            'product_id' => $productWithVariantId,
            'is_active' => true,
            'sort_order' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $query = Brand::query()->where('is_active', true);
        CatalogProductQueryFilters::applyStorefrontBrandVisibilityFilter($query);
        $ids = $query->orderBy('id')->pluck('id')->map(static fn ($id): int => (int) $id)->all();

        $this->assertSame([$withVariantId], $ids);
        $this->assertNotContains($withoutVariantId, $ids);
        $this->assertNotContains($emptyBrandId, $ids);
    }

    public function test_catalog_listing_excludes_products_without_active_variants(): void
    {
        $now = now();

        $brandId = DB::table('brands')->insertGetId([
            'name' => 'Brand',
            'slug' => 'brand',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $withVariantId = DB::table('products')->insertGetId([
            'brand_id' => $brandId,
            'name' => 'With',
            'slug' => 'with',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('products')->insert([
            'brand_id' => $brandId,
            'name' => 'Without',
            'slug' => 'without',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('product_variant_links')->insert([
            'product_id' => $withVariantId,
            'is_active' => true,
            'sort_order' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $query = Product::query();
        CatalogProductQueryFilters::applyCatalogListingProductFilter($query);
        $ids = $query->orderBy('id')->pluck('id')->map(static fn ($id): int => (int) $id)->all();

        $this->assertSame([$withVariantId], $ids);
    }
}
