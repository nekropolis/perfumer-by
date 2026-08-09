<?php

namespace Tests\Feature;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSeoBatch;
use Modules\Catalog\Models\ProductSeoBatchItem;
use Modules\Catalog\Models\ProductSeoFieldReceipt;
use Modules\Catalog\Services\SeoDescription\ProductSeoWorkQueueService;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;
use Tests\TestCase;

class ProductSeoWorkQueueTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createMinimalSchema();
        config()->set('seo_description.url', 'http://seo.test/api');
        config()->set('seo_description.token', 'site-token');
        config()->set('seo_description.site', 'perfumer');
        config()->set('seo_description.get_retries', 0);
        config()->set('seo_description.work_chunk_size', 25);
        config()->set('services.catalog_search.enabled', false);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('product_seo_field_receipts');
        Schema::dropIfExists('product_seo_batch_items');
        Schema::dropIfExists('product_seo_batches');
        Schema::dropIfExists('legacy_unmatched_products');
        Schema::dropIfExists('legacy_map_products');
        Schema::dropIfExists('product_attribute_value_options');
        Schema::dropIfExists('product_attribute_values');
        Schema::dropIfExists('product_attribute_options');
        Schema::dropIfExists('product_attributes');
        Schema::dropIfExists('products');
        Schema::dropIfExists('brands');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_submit_work_excludes_filled_legacy_and_sends_chunk(): void
    {
        [$user, $product] = $this->adminAndProduct([
            'description' => '<p>Есть текст</p>',
        ]);
        $legacyFilled = Product::query()->create([
            'brand_id' => $product->brand_id,
            'name' => 'Legacy filled',
            'slug' => 'legacy-filled',
            'seo_description' => 'Legacy meta description text.',
            'short_description' => str_repeat('Краткое описание товара. ', 8),
            'description' => '<p>'.str_repeat('Полное описание аромата. ', 40).'</p>',
        ]);
        DB::table('legacy_map_products')->insert([
            'legacy_product_id' => 1,
            'product_id' => $legacyFilled->id,
            'status' => 'matched',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Http::fake([
            'http://seo.test/api/products/work' => Http::response([
                'batch_id' => 'batch-1',
                'accepted' => 1,
                'queued' => 1,
            ], 200),
        ]);

        $this->actingAs($user, 'sanctum');
        $response = $this->postJson('/api/admin/seo/product-descriptions/work')
            ->assertStatus(202);

        $this->assertSame(1, $response->json('data.requested_count'));
        $this->assertDatabaseCount('product_seo_batches', 1);
        $this->assertDatabaseHas('product_seo_batch_items', [
            'product_id' => $product->id,
            'external_id' => (string) $product->id,
        ]);
        $this->assertDatabaseMissing('product_seo_batch_items', [
            'product_id' => $legacyFilled->id,
        ]);

        Http::assertSent(function ($request) use ($product): bool {
            if ($request->url() !== 'http://seo.test/api/products/work') {
                return false;
            }
            $products = $request['products'] ?? [];
            if (count($products) !== 1) {
                return false;
            }
            $row = $products[0];

            return $row['external_id'] === (string) $product->id
                && array_key_exists('seo_description', $row['fields'])
                && array_key_exists('short_description', $row['fields'])
                && array_key_exists('description', $row['fields'])
                && ! array_key_exists('seo_title', $row['fields'])
                && ! array_key_exists('h1', $row['fields']);
        });
    }

    public function test_submit_work_sends_only_empty_fields_for_legacy_product(): void
    {
        [$user, $product] = $this->adminAndProduct([
            'seo_description' => 'Already has meta.',
            'short_description' => str_repeat('Краткое описание товара. ', 8),
            'description' => '<p>'.str_repeat('Полное описание аромата. ', 40).'</p>',
        ]);
        foreach (['seo_description', 'short_description', 'description'] as $field) {
            ProductSeoFieldReceipt::query()->create([
                'product_id' => $product->id,
                'field' => $field,
                'value_hash' => hash('sha256', (string) $product->getAttribute($field)),
                'received_at' => now(),
            ]);
        }

        $legacy = Product::query()->create([
            'brand_id' => $product->brand_id,
            'name' => 'Legacy partial',
            'slug' => 'legacy-partial',
            'seo_description' => null,
            'short_description' => str_repeat('Краткое описание товара. ', 8),
            'description' => '<p>'.str_repeat('Полное описание аромата. ', 40).'</p>',
        ]);
        DB::table('legacy_map_products')->insert([
            'legacy_product_id' => 2,
            'product_id' => $legacy->id,
            'status' => 'matched',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Http::fake([
            'http://seo.test/api/products/work' => Http::response([
                'batch_id' => 'batch-legacy',
                'accepted' => 1,
                'queued' => 1,
            ], 200),
        ]);

        $this->actingAs($user, 'sanctum');
        $response = $this->postJson('/api/admin/seo/product-descriptions/work')
            ->assertStatus(202);

        $this->assertSame(1, $response->json('data.requested_count'));
        $this->assertDatabaseHas('product_seo_batch_items', [
            'product_id' => $legacy->id,
            'external_id' => (string) $legacy->id,
        ]);

        Http::assertSent(function ($request) use ($legacy): bool {
            if ($request->url() !== 'http://seo.test/api/products/work') {
                return false;
            }
            $products = $request['products'] ?? [];
            if (count($products) !== 1) {
                return false;
            }
            $row = $products[0];
            $fields = $row['fields'] ?? [];

            return $row['external_id'] === (string) $legacy->id
                && array_keys($fields) === ['seo_description']
                && $fields['seo_description'] === null;
        });
    }

    public function test_complete_receipts_exclude_product_until_field_cleared(): void
    {
        [, $product] = $this->adminAndProduct([
            'seo_description' => 'Meta description value for product.',
            'short_description' => str_repeat('Краткое описание товара. ', 8),
            'description' => '<p>'.str_repeat('Полное описание аромата. ', 40).'</p>',
        ]);

        foreach (['seo_description', 'short_description', 'description'] as $field) {
            ProductSeoFieldReceipt::query()->create([
                'product_id' => $product->id,
                'field' => $field,
                'value_hash' => hash('sha256', (string) $product->getAttribute($field)),
                'received_at' => now(),
            ]);
        }

        $service = app(ProductSeoWorkQueueService::class);
        $this->assertSame(0, $service->eligibleQuery()->count());

        $product->update(['seo_description' => null]);
        $this->assertSame(1, $service->eligibleQuery()->count());
    }

    public function test_pull_ready_applies_fields_and_acks(): void
    {
        [, $product] = $this->adminAndProduct();
        $batch = ProductSeoBatch::query()->create([
            'external_batch_id' => 'batch-2',
            'status' => ProductSeoBatch::STATUS_SUBMITTED,
            'requested_count' => 1,
            'accepted_count' => 1,
            'queued_count' => 1,
            'submitted_at' => now(),
        ]);
        $batch->items()->create([
            'product_id' => $product->id,
            'external_id' => (string) $product->id,
            'requested_fields' => ['seo_description', 'short_description', 'description'],
            'status' => 'submitted',
        ]);

        $description = '<p>'.str_repeat('Оригинальный аромат с проверенными характеристиками. ', 20).'</p>';
        Http::fake([
            'http://seo.test/api/products/ready*' => Http::response([
                'data' => [[
                    'external_id' => (string) $product->id,
                    'result' => [
                        'seo_description' => 'Купить оригинальный аромат в Минске.',
                        'short_description' => str_repeat('Краткое описание оригинального аромата. ', 5),
                        'description' => $description,
                    ],
                ]],
            ]),
            'http://seo.test/api/products/ack' => Http::response(['acked' => 1]),
        ]);

        $result = app(ProductSeoWorkQueueService::class)->pullAndApplyReady();
        $this->assertSame(1, $result['applied']);
        $this->assertSame(1, $result['acked']);
        $this->assertSame('Купить оригинальный аромат в Минске.', $product->fresh()->seo_description);
        $this->assertNotNull($product->fresh()->description_rewritten_at);
        $this->assertDatabaseCount('product_seo_field_receipts', 3);

        Http::assertSent(fn ($request): bool => $request->url() === 'http://seo.test/api/products/ack'
            && $request['external_ids'] === [(string) $product->id]);
    }

    public function test_pull_ready_retries_failed_items_and_fixes_counters(): void
    {
        [, $product] = $this->adminAndProduct();
        $batch = ProductSeoBatch::query()->create([
            'external_batch_id' => 'batch-failed-retry',
            'status' => ProductSeoBatch::STATUS_SUBMITTED,
            'requested_count' => 1,
            'accepted_count' => 1,
            'queued_count' => 1,
            'applied_count' => 0,
            'failed_count' => 1,
            'submitted_at' => now(),
        ]);
        $item = $batch->items()->create([
            'product_id' => $product->id,
            'external_id' => (string) $product->id,
            'requested_fields' => ['seo_description', 'short_description', 'description'],
            'status' => ProductSeoBatchItem::STATUS_FAILED,
            'error' => 'SEO API short_description length is invalid.',
        ]);

        $description = '<p>'.str_repeat('Оригинальный аромат с проверенными характеристиками. ', 20).'</p>';
        Http::fake([
            'http://seo.test/api/products/ready*' => Http::response([
                'products' => [[
                    'external_id' => (string) $product->id,
                    'result' => [
                        'seo_description' => 'Купить оригинальный аромат в Минске.',
                        'short_description' => 'Короткий текст от SEO API.',
                        'description' => $description,
                    ],
                ]],
            ]),
            'http://seo.test/api/products/ack' => Http::response(['acked' => 1]),
        ]);

        $result = app(ProductSeoWorkQueueService::class)->pullAndApplyReady();
        $freshBatch = $batch->fresh();
        $freshItem = $item->fresh();

        $this->assertSame(1, $result['applied']);
        $this->assertSame(ProductSeoBatchItem::STATUS_APPLIED, $freshItem->status);
        $this->assertNull($freshItem->error);
        $this->assertSame(1, $freshBatch->applied_count);
        $this->assertSame(0, $freshBatch->failed_count);
        $this->assertSame('Короткий текст от SEO API.', $product->fresh()->short_description);
    }

    public function test_pull_ready_applies_only_empty_legacy_fields(): void
    {
        [, $product] = $this->adminAndProduct([
            'seo_description' => null,
            'short_description' => str_repeat('Краткое описание товара. ', 8),
            'description' => '<p>'.str_repeat('Полное описание аромата. ', 40).'</p>',
        ]);
        DB::table('legacy_map_products')->insert([
            'legacy_product_id' => 3,
            'product_id' => $product->id,
            'status' => 'matched',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batch = ProductSeoBatch::query()->create([
            'external_batch_id' => 'batch-legacy-ready',
            'status' => ProductSeoBatch::STATUS_SUBMITTED,
            'requested_count' => 1,
            'accepted_count' => 1,
            'queued_count' => 1,
            'submitted_at' => now(),
        ]);
        $batch->items()->create([
            'product_id' => $product->id,
            'external_id' => (string) $product->id,
            'requested_fields' => ['seo_description'],
            'status' => 'submitted',
        ]);

        $originalShort = $product->short_description;
        $originalDescription = $product->description;
        $description = '<p>'.str_repeat('Оригинальный аромат с проверенными характеристиками. ', 20).'</p>';

        Http::fake([
            'http://seo.test/api/products/ready*' => Http::response([
                'data' => [[
                    'external_id' => (string) $product->id,
                    'result' => [
                        'seo_description' => 'Купить оригинальный аромат в Минске.',
                        'short_description' => str_repeat('Новое краткое описание аромата. ', 5),
                        'description' => $description,
                    ],
                ]],
            ]),
            'http://seo.test/api/products/ack' => Http::response(['acked' => 1]),
        ]);

        $result = app(ProductSeoWorkQueueService::class)->pullAndApplyReady();
        $fresh = $product->fresh();

        $this->assertSame(1, $result['applied']);
        $this->assertSame('Купить оригинальный аромат в Минске.', $fresh->seo_description);
        $this->assertSame($originalShort, $fresh->short_description);
        $this->assertSame($originalDescription, $fresh->description);
        $this->assertDatabaseHas('product_seo_field_receipts', [
            'product_id' => $product->id,
            'field' => 'seo_description',
        ]);
        $this->assertDatabaseMissing('product_seo_field_receipts', [
            'product_id' => $product->id,
            'field' => 'description',
        ]);
    }

    /**
     * @param  array<string, mixed>  $productAttributes
     * @return array{Authenticatable, Product}
     */
    private function adminAndProduct(array $productAttributes = []): array
    {
        $user = User::query()->create([
            'name' => 'Admin',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password',
            'role' => Role::ADMIN->value,
        ]);
        $brand = Brand::query()->create([
            'name' => 'Dior',
            'slug' => 'dior-'.uniqid(),
            'is_active' => true,
        ]);
        $product = Product::query()->create(array_merge([
            'brand_id' => $brand->id,
            'name' => 'Sauvage',
            'slug' => 'dior-sauvage-'.uniqid(),
        ], $productAttributes));

        return [$user, $product];
    }

    private function createMinimalSchema(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('role');
            $table->string('phone')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('brands', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('brand_id')->nullable();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('h1')->nullable();
            $table->text('short_description')->nullable();
            $table->longText('description')->nullable();
            $table->timestamp('description_rewritten_at')->nullable();
            $table->string('seo_title')->nullable();
            $table->string('seo_description', 500)->nullable();
            $table->text('seo_keyword')->nullable();
            $table->timestamps();
        });
        Schema::create('product_attributes', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('product_attribute_options', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_attribute_id');
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('product_attribute_values', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id');
            $table->foreignId('product_attribute_id');
            $table->string('custom_value')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
        Schema::create('product_attribute_value_options', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_attribute_value_id');
            $table->foreignId('product_attribute_option_id');
            $table->timestamps();
        });
        Schema::create('legacy_map_products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('legacy_product_id')->nullable();
            $table->foreignId('product_id')->nullable();
            $table->string('status');
            $table->timestamps();
        });
        Schema::create('legacy_unmatched_products', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('linked_product_id')->nullable();
            $table->string('status');
            $table->timestamps();
        });
        Schema::create('product_seo_batches', function (Blueprint $table): void {
            $table->id();
            $table->string('external_batch_id')->nullable();
            $table->string('status', 30)->default('pending');
            $table->unsignedInteger('requested_count')->default(0);
            $table->unsignedInteger('accepted_count')->default(0);
            $table->unsignedInteger('queued_count')->default(0);
            $table->unsignedInteger('applied_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->boolean('force')->default(false);
            $table->json('response')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
        Schema::create('product_seo_batch_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_seo_batch_id');
            $table->foreignId('product_id');
            $table->string('external_id', 64);
            $table->json('requested_fields');
            $table->string('status', 30)->default('submitted');
            $table->json('result')->nullable();
            $table->json('applied_fields')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
        });
        Schema::create('product_seo_field_receipts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id');
            $table->string('field', 40);
            $table->string('value_hash', 64);
            $table->foreignId('product_seo_batch_item_id')->nullable();
            $table->timestamp('received_at');
            $table->timestamps();
            $table->unique(['product_id', 'field']);
        });
    }
}
