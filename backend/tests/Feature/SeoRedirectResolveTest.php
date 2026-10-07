<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SeoRedirectResolveTest extends TestCase
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

    public function test_it_resolves_an_active_redirect(): void
    {
        DB::table('seo_redirects')->insert([
            'from_path' => '/old-page',
            'to_path' => '/new-page',
            'http_code' => 301,
            'is_active' => true,
            'source' => 'manual',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/seo-redirects/resolve', ['path' => '/old-page'])
            ->assertOk()
            ->assertJsonPath('data.to_path', '/new-page')
            ->assertJsonPath('data.http_code', 301);
    }

    public function test_it_ignores_an_inactive_redirect(): void
    {
        DB::table('seo_redirects')->insert([
            'from_path' => '/old-page',
            'to_path' => '/new-page',
            'http_code' => 302,
            'is_active' => false,
            'source' => 'manual',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/seo-redirects/resolve', ['path' => '/old-page'])
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_trailing_space_from_path_does_not_match_clean_path(): void
    {
        DB::table('seo_redirects')->insert([
            'from_path' => '/lalique-soleil ',
            'to_path' => '/lalique-soleil',
            'http_code' => 301,
            'is_active' => true,
            'source' => 'legacy_product_link',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/seo-redirects/resolve', ['path' => '/lalique-soleil '])
            ->assertOk()
            ->assertJsonPath('data.to_path', '/lalique-soleil')
            ->assertJsonPath('data.http_code', 301);

        $this->postJson('/api/seo-redirects/resolve', ['path' => '/lalique-soleil'])
            ->assertOk()
            ->assertJsonPath('data', null);
    }
}
