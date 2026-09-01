<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\ImportExport\Services\Allparfume\AllparfumeIdFileImportService;
use Tests\TestCase;

class AllparfumeIdFileImportRedirectTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('slug');
            $table->string('name')->default('Test');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('seo_redirects', function (Blueprint $table): void {
            $table->id();
            $table->string('from_path', 500)->unique();
            $table->string('to_path', 500)->nullable();
            $table->unsignedSmallInteger('http_code')->default(301);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('allparfume_products', function (Blueprint $table): void {
            $table->id();
            $table->string('brand_slug', 191);
            $table->string('external_slug', 500);
            $table->string('source_url', 1000)->default('https://allparfume.by/christian_dior/sauvage.html');
            $table->string('source_url_hash', 40)->unique();
            $table->unsignedBigInteger('product_id')->nullable();
            $table->unsignedBigInteger('external_id')->nullable();
            $table->string('match_status', 32)->default('unmatched');
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('allparfume_products');
            Schema::dropIfExists('seo_redirects');
            Schema::dropIfExists('products');
        }

        parent::tearDown();
    }

    public function test_it_matches_perfumer_url_via_seo_redirect_from(): void
    {
        $productId = DB::table('products')->insertGetId([
            'slug' => 'dior-sauvage',
            'name' => 'Sauvage',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('seo_redirects')->insert([
            'from_path' => '/old-sauvage',
            'to_path' => '/dior-sauvage',
            'http_code' => 301,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $allparfumeId = DB::table('allparfume_products')->insertGetId([
            'brand_slug' => 'christian_dior',
            'external_slug' => 'sauvage',
            'source_url_hash' => sha1('sauvage'),
            'match_status' => 'unmatched',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $stats = app(AllparfumeIdFileImportService::class)->import([
            [
                'perfumer_url' => 'https://perfumer.by/old-sauvage',
                'allparfume_url' => 'https://allparfume.by/christian_dior/sauvage.html',
                'allparfume_id' => 3597,
            ],
        ]);

        $this->assertSame(1, $stats['updated']);
        $this->assertSame(0, $stats['unmatched_slug']);
        $this->assertSame($productId, (int) DB::table('allparfume_products')->where('id', $allparfumeId)->value('product_id'));
        $this->assertSame(3597, (int) DB::table('allparfume_products')->where('id', $allparfumeId)->value('external_id'));
    }

    public function test_it_links_allparfume_id_to_all_urls_in_array(): void
    {
        $edpId = DB::table('products')->insertGetId([
            'slug' => 'chanel-pour-monsieur-eau-de-parfum',
            'name' => 'Pour Monsieur EDP',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $edtId = DB::table('products')->insertGetId([
            'slug' => 'chanel-pour-monsieur-eau-de-toilette',
            'name' => 'Pour Monsieur EDT',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('seo_redirects')->insert([
            'from_path' => '/chanel-pour-monsieur',
            'to_path' => '/chanel-pour-monsieur-eau-de-parfum',
            'http_code' => 301,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $allparfumeId = DB::table('allparfume_products')->insertGetId([
            'brand_slug' => 'chanel',
            'external_slug' => 'pour_monsieur',
            'source_url_hash' => sha1('pour-monsieur'),
            'match_status' => 'unmatched',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $urls = [
            'https://perfumer.by/chanel-pour-monsieur',
            'https://perfumer.by/chanel-pour-monsieur-eau-de-toilette',
        ];
        $stats = app(AllparfumeIdFileImportService::class)->import([
            [
                'perfumer_url' => $urls,
                'allparfume_url' => 'https://allparfume.by/chanel/pour_monsieur.html',
                'allparfume_id' => 695,
            ],
        ]);

        $this->assertSame(1, $stats['updated']);
        $this->assertSame(0, $stats['unmatched_slug']);
        $row = (array) DB::table('allparfume_products')->where('id', $allparfumeId)->first();
        $this->assertSame($edpId, (int) $row['product_id']);
        $this->assertSame(695, (int) $row['external_id']);
        $payload = is_array($row['payload'])
            ? $row['payload']
            : json_decode((string) $row['payload'], true);
        $this->assertSame([$edpId, $edtId], $payload['id_file_product_ids']);
        $this->assertSame($urls, $payload['id_file_perfumer_urls']);
    }

    public function test_it_ignores_inactive_seo_redirect(): void
    {
        DB::table('products')->insert([
            'slug' => 'dior-sauvage',
            'name' => 'Sauvage',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('seo_redirects')->insert([
            'from_path' => '/old-sauvage',
            'to_path' => '/dior-sauvage',
            'http_code' => 301,
            'is_active' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('allparfume_products')->insert([
            'brand_slug' => 'christian_dior',
            'external_slug' => 'sauvage',
            'source_url_hash' => sha1('sauvage-inactive'),
            'match_status' => 'unmatched',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $stats = app(AllparfumeIdFileImportService::class)->import([
            [
                'perfumer_url' => 'https://perfumer.by/old-sauvage',
                'allparfume_url' => 'https://allparfume.by/christian_dior/sauvage.html',
                'allparfume_id' => 3597,
            ],
        ]);

        $this->assertSame(0, $stats['updated']);
        $this->assertSame(1, $stats['unmatched_slug']);
    }
}
