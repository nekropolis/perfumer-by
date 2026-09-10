<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MapLegacyProductsBySlugCommandTest extends TestCase
{
    private string $dumpPath = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->default('Test');
            $table->string('slug')->unique();
            $table->timestamps();
        });
        Schema::create('legacy_map_products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('legacy_product_id')->unique();
            $table->string('legacy_slug', 500)->nullable();
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('status', 32)->default('unmatched');
            $table->string('match_method', 64)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });
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
            $table->string('status', 32)->default('unmatched');
            $table->text('skip_reason')->nullable();
            $table->unsignedBigInteger('linked_product_id')->nullable();
            $table->unsignedBigInteger('redirect_id')->nullable();
            $table->unsignedBigInteger('linked_by_user_id')->nullable();
            $table->timestamp('linked_at')->nullable();
            $table->json('sync_snapshot')->nullable();
            $table->timestamps();
        });
        Schema::create('seo_redirects', function (Blueprint $table): void {
            $table->id();
            $table->string('from_path', 500)->unique();
            $table->string('to_path', 500)->nullable();
            $table->unsignedSmallInteger('http_code')->default(301);
            $table->boolean('is_active')->default(true);
            $table->string('source', 64)->default('manual');
            $table->timestamps();
        });

        $this->dumpPath = sys_get_temp_dir().'/legacy-map-products-test-'.uniqid('', true).'.sql';
        file_put_contents($this->dumpPath, <<<'SQL'
INSERT INTO `oc_url_alias` VALUES
(1,'product_id=101','keep-matched'),
(2,'product_id=102','keep-linked'),
(3,'product_id=103','already-from'),
(4,'product_id=104','was-skipped'),
(5,'product_id=105','plain-unmatched'),
(6,'product_id=106','now-in-catalog'),
(7,'product_id=107','skipped-with-from'),
(8,'product_id=109','dump-from-only'),
(9,'product_id=110','brand-new-unmatched'),
(10,'product_id=111','old-matched-slug-changed');
SQL);
    }

    protected function tearDown(): void
    {
        if ($this->dumpPath !== '' && is_file($this->dumpPath)) {
            @unlink($this->dumpPath);
        }

        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('seo_redirects');
            Schema::dropIfExists('legacy_unmatched_products');
            Schema::dropIfExists('legacy_map_products');
            Schema::dropIfExists('products');
        }

        parent::tearDown();
    }

    public function test_rerun_skips_matched_linked_and_from_and_requeues_skipped(): void
    {
        $matchedProductId = (int) DB::table('products')->insertGetId([
            'name' => 'Matched',
            'slug' => 'keep-matched',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $linkedTargetId = (int) DB::table('products')->insertGetId([
            'name' => 'Linked target',
            'slug' => 'linked-target',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('products')->insert([
            'name' => 'Now in catalog',
            'slug' => 'now-in-catalog',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('legacy_map_products')->insert([
            [
                'legacy_product_id' => 101,
                'legacy_slug' => 'keep-matched',
                'product_id' => $matchedProductId,
                'status' => 'matched',
                'match_method' => 'slug_exact',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'legacy_product_id' => 111,
                'legacy_slug' => 'keep-matched',
                'product_id' => $matchedProductId,
                'status' => 'matched',
                'match_method' => 'slug_exact',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $linkedRedirectId = (int) DB::table('seo_redirects')->insertGetId([
            'from_path' => '/keep-linked',
            'to_path' => '/linked-target',
            'http_code' => 301,
            'is_active' => true,
            'source' => 'legacy_product_link',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('seo_redirects')->insert([
            [
                'from_path' => '/already-from',
                'to_path' => '/somewhere',
                'http_code' => 301,
                'is_active' => true,
                'source' => 'manual',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'from_path' => '/skipped-with-from',
                'to_path' => '/elsewhere',
                'http_code' => 301,
                'is_active' => true,
                'source' => 'manual',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'from_path' => '/dump-from-only',
                'to_path' => '/elsewhere-2',
                'http_code' => 301,
                'is_active' => true,
                'source' => 'manual',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $now = now();
        $unmatchedDefaults = [
            'legacy_description' => null,
            'legacy_meta_title' => null,
            'legacy_meta_description' => null,
            'legacy_meta_keyword' => null,
            'legacy_reviews' => null,
            'skip_reason' => null,
            'linked_product_id' => null,
            'redirect_id' => null,
            'linked_by_user_id' => null,
            'linked_at' => null,
            'sync_snapshot' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ];
        DB::table('legacy_unmatched_products')->insert([
            array_merge($unmatchedDefaults, [
                'legacy_product_id' => 102,
                'legacy_slug' => 'keep-linked',
                'legacy_name' => 'Linked product',
                'status' => 'linked',
                'linked_product_id' => $linkedTargetId,
                'redirect_id' => $linkedRedirectId,
                'linked_at' => $now,
            ]),
            array_merge($unmatchedDefaults, [
                'legacy_product_id' => 103,
                'legacy_slug' => 'already-from',
                'legacy_name' => 'Has From',
                'status' => 'unmatched',
            ]),
            array_merge($unmatchedDefaults, [
                'legacy_product_id' => 104,
                'legacy_slug' => 'was-skipped',
                'legacy_name' => 'Accidentally skipped',
                'status' => 'skipped',
                'skip_reason' => 'qqq',
            ]),
            array_merge($unmatchedDefaults, [
                'legacy_product_id' => 105,
                'legacy_slug' => 'plain-unmatched',
                'legacy_name' => 'Still unmatched',
                'status' => 'unmatched',
            ]),
            array_merge($unmatchedDefaults, [
                'legacy_product_id' => 106,
                'legacy_slug' => 'now-in-catalog',
                'legacy_name' => 'Became matched',
                'status' => 'unmatched',
            ]),
            array_merge($unmatchedDefaults, [
                'legacy_product_id' => 107,
                'legacy_slug' => 'skipped-with-from',
                'legacy_name' => 'Skipped but From exists',
                'status' => 'skipped',
                'skip_reason' => 'qqq',
            ]),
        ]);

        $redirectsBefore = DB::table('seo_redirects')->orderBy('id')->get()->toArray();

        $exit = Artisan::call('legacy:map-products-by-slug', [
            '--dump' => $this->dumpPath,
        ]);

        $this->assertSame(0, $exit);

        $linked = DB::table('legacy_unmatched_products')->where('legacy_product_id', 102)->first();
        $this->assertNotNull($linked);
        $this->assertSame('linked', $linked->status);
        $this->assertSame($linkedTargetId, (int) $linked->linked_product_id);
        $this->assertSame($linkedRedirectId, (int) $linked->redirect_id);

        $matchedMap = DB::table('legacy_map_products')->where('legacy_product_id', 101)->first();
        $this->assertSame('matched', $matchedMap->status);
        $this->assertSame($matchedProductId, (int) $matchedMap->product_id);

        $preservedMatched = DB::table('legacy_map_products')->where('legacy_product_id', 111)->first();
        $this->assertSame('matched', $preservedMatched->status);
        $this->assertSame($matchedProductId, (int) $preservedMatched->product_id);
        $this->assertSame('keep-matched', $preservedMatched->legacy_slug);

        $this->assertNull(DB::table('legacy_unmatched_products')->where('legacy_product_id', 101)->first());
        $this->assertNull(DB::table('legacy_unmatched_products')->where('legacy_product_id', 103)->first());
        $this->assertNull(DB::table('legacy_unmatched_products')->where('legacy_product_id', 106)->first());
        $this->assertNull(DB::table('legacy_unmatched_products')->where('legacy_product_id', 107)->first());
        $this->assertNull(DB::table('legacy_unmatched_products')->where('legacy_product_id', 109)->first());
        $this->assertNull(DB::table('legacy_unmatched_products')->where('legacy_product_id', 111)->first());

        $requeued = DB::table('legacy_unmatched_products')->where('legacy_product_id', 104)->first();
        $this->assertNotNull($requeued);
        $this->assertSame('unmatched', $requeued->status);
        $this->assertNull($requeued->skip_reason);

        $plain = DB::table('legacy_unmatched_products')->where('legacy_product_id', 105)->first();
        $this->assertNotNull($plain);
        $this->assertSame('unmatched', $plain->status);

        $fresh = DB::table('legacy_unmatched_products')->where('legacy_product_id', 110)->first();
        $this->assertNotNull($fresh);
        $this->assertSame('unmatched', $fresh->status);
        $this->assertSame('brand-new-unmatched', $fresh->legacy_slug);

        $nowMatched = DB::table('legacy_map_products')->where('legacy_product_id', 106)->first();
        $this->assertSame('matched', $nowMatched->status);

        $this->assertSame(
            array_map(static fn ($row) => (array) $row, $redirectsBefore),
            array_map(static fn ($row) => (array) $row, DB::table('seo_redirects')->orderBy('id')->get()->all()),
        );

        $this->assertSame(1, DB::table('legacy_unmatched_products')->where('status', 'linked')->count());
        $this->assertSame(0, DB::table('legacy_unmatched_products')->where('status', 'skipped')->count());
        $this->assertSame(3, DB::table('legacy_unmatched_products')->where('status', 'unmatched')->count());
    }
}
