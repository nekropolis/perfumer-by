<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LegacyOpenCartRedirectTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('seo_redirects', function (Blueprint $table): void {
            $table->id();
            $table->string('from_path', 500)->unique();
            $table->string('to_path', 500)->nullable();
            $table->unsignedSmallInteger('http_code')->default(301);
            $table->boolean('is_active')->default(true);
            $table->string('source', 64)->default('manual');
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('seo_redirects');
        }

        parent::tearDown();
    }

    public function test_index_php_category_redirects_to_brand(): void
    {
        DB::table('seo_redirects')->insert([
            'from_path' => '/index.php?route=product/category&path=59_339',
            'to_path' => '/brands/armaf',
            'http_code' => 301,
            'is_active' => true,
            'source' => 'gsc_migration',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->get('/index.php?route=product/category&path=59_339')
            ->assertRedirect('/brands/armaf');
    }

    public function test_index_php_without_matching_redirect_passes_through(): void
    {
        $response = $this->get('/index.php?route=product/category&path=99999');
        $this->assertFalse($response->isRedirection());
    }

    public function test_non_index_php_paths_are_not_handled_here(): void
    {
        DB::table('seo_redirects')->insert([
            'from_path' => '/rammstein',
            'to_path' => '/brands/rammstein',
            'http_code' => 301,
            'is_active' => true,
            'source' => 'gsc_migration',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Middleware only fires for path /index.php; /rammstein is Next's job.
        $response = $this->get('/rammstein');
        $this->assertFalse($response->isRedirection());
    }
}
