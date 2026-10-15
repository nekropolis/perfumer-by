<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Pages\Models\CmsPage;
use Modules\Pages\Services\SeoSitemapService;
use Tests\TestCase;

/**
 * Главная живёт на `/`, а `/glavnaya` редиректит туда — в sitemap этого slug быть не должно.
 */
class SeoSitemapHomeSlugTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('cms_pages', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('h1')->nullable();
            $table->longText('content')->nullable();
            $table->string('seo_title')->nullable();
            $table->text('seo_description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('cms_posts', function (Blueprint $table): void {
            $table->id();
            $table->boolean('is_active')->default(true);
            $table->string('title');
            $table->string('slug')->nullable();
            $table->timestamps();
        });
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->nullable();
            $table->string('slug')->nullable();
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('product_variant_links', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('brands', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->nullable();
            $table->string('slug')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Cache::forget(SeoSitemapService::CACHE_KEY);
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Cache::forget(SeoSitemapService::CACHE_KEY);
            foreach (['brands', 'product_variant_links', 'products', 'cms_posts', 'cms_pages'] as $table) {
                Schema::dropIfExists($table);
            }
        }

        parent::tearDown();
    }

    public function test_home_cms_slug_is_excluded_from_sitemap(): void
    {
        foreach ([CmsPage::HOME_SLUG, 'home', 'o-nas'] as $slug) {
            DB::table('cms_pages')->insert([
                'name' => $slug,
                'slug' => $slug,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $paths = array_column((new SeoSitemapService())->warm(), 'path');

        $this->assertContains('/o-nas', $paths);
        $this->assertNotContains('/'.CmsPage::HOME_SLUG, $paths);
        $this->assertNotContains('/home', $paths);
    }
}
