<?php

namespace Tests\Feature;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Jobs\DispatchProductSeoGeneration;
use Modules\Catalog\Jobs\PollProductSeoGeneration;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSeoGeneration;
use Modules\Catalog\Services\SeoDescription\ProductSeoGenerationService;
use Modules\Catalog\Services\SeoDescription\SeoDescriptionClient;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;
use Tests\TestCase;

class ProductSeoGenerationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createMinimalSchema();
        config()->set('seo_description.url', 'http://seo.test/api');
        config()->set('seo_description.token', 'site-token');
        config()->set('seo_description.site', 'perfumer');
        config()->set('seo_description.get_retries', 0);
        config()->set('services.catalog_search.enabled', false);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('product_seo_generations');
        Schema::dropIfExists('product_attribute_value_options');
        Schema::dropIfExists('product_attribute_values');
        Schema::dropIfExists('product_attribute_options');
        Schema::dropIfExists('product_attributes');
        Schema::dropIfExists('products');
        Schema::dropIfExists('brands');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_admin_can_preview_and_start_one_active_generation(): void
    {
        Queue::fake();
        [$user, $product] = $this->adminAndProduct();
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/admin/products/'.$product->id.'/generate-seo/preview')
            ->assertOk()
            ->assertJsonPath('data.fields.seo_description.state', 'new')
            ->assertJsonPath('data.fields.short_description.state', 'new')
            ->assertJsonPath('data.fields.description.state', 'new')
            ->assertJsonMissingPath('data.fields.h1')
            ->assertJsonMissingPath('data.fields.seo_title');

        $first = $this->postJson('/api/admin/products/'.$product->id.'/generate-seo', [
            'fields' => [
                'seo_description' => null,
                'description' => null,
            ],
        ])->assertStatus(202);

        $second = $this->postJson('/api/admin/products/'.$product->id.'/generate-seo', [
            'fields' => ['short_description' => null],
        ])->assertStatus(202);

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertDatabaseCount('product_seo_generations', 1);
        Queue::assertPushed(DispatchProductSeoGeneration::class, 1);
    }

    public function test_manual_value_requires_explicit_confirmation(): void
    {
        Queue::fake();
        [$user, $product] = $this->adminAndProduct([
            'seo_description' => 'Ручное SEO description',
        ]);
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/admin/products/'.$product->id.'/generate-seo', [
            'fields' => ['seo_description' => 'Ручное SEO description'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('confirm_manual_changes');

        $this->postJson('/api/admin/products/'.$product->id.'/generate-seo', [
            'fields' => ['seo_description' => 'Ручное SEO description'],
            'confirm_manual_changes' => true,
        ])->assertStatus(202);
    }

    public function test_dispatch_and_poll_apply_only_requested_fields(): void
    {
        Queue::fake();
        [, $product] = $this->adminAndProduct();
        $service = app(ProductSeoGenerationService::class);
        $generation = $service->start($product, ['seo_description'], false);

        Http::fake([
            'http://seo.test/api/generate' => Http::response([
                'job_id' => 'job-1',
                'status' => 'pending',
            ], 202),
            'http://seo.test/api/generate/job-1' => Http::response([
                'job_id' => 'job-1',
                'status' => 'completed',
                'result' => ['seo_description' => 'Купить Dior Sauvage в Минске с доставкой.'],
                'error' => null,
            ]),
        ]);

        (new DispatchProductSeoGeneration($generation->id))->handle(
            app(SeoDescriptionClient::class),
            $service,
        );
        Queue::assertPushed(PollProductSeoGeneration::class);

        (new PollProductSeoGeneration($generation->id))->handle(
            app(SeoDescriptionClient::class),
            $service,
        );

        $this->assertSame(
            'Купить Dior Sauvage в Минске с доставкой.',
            $product->fresh()->seo_description,
        );
        $this->assertNull($product->fresh()->short_description);
        $this->assertNull($product->fresh()->description);
        $this->assertSame(ProductSeoGeneration::STATUS_COMPLETED, $generation->fresh()->status);
        $this->assertNull($product->fresh()->description_rewritten_at);
    }

    public function test_stale_snapshot_stores_conflict_without_overwriting_product(): void
    {
        Queue::fake();
        [, $product] = $this->adminAndProduct();
        $service = app(ProductSeoGenerationService::class);
        $generation = $service->start($product, ['seo_description'], false);

        $product->update(['seo_description' => 'Ручная правка после запуска']);
        $service->applyCompleted($generation->id, [
            'seo_description' => 'Сгенерированное description',
        ]);

        $this->assertSame('Ручная правка после запуска', $product->fresh()->seo_description);
        $this->assertSame(ProductSeoGeneration::STATUS_CONFLICTED, $generation->fresh()->status);
        $this->assertSame('Сгенерированное description', $generation->fresh()->result['seo_description']);
    }

    public function test_invalid_completed_result_is_retained_for_diagnostics(): void
    {
        Queue::fake();
        [, $product] = $this->adminAndProduct();
        $service = app(ProductSeoGenerationService::class);
        $generation = $service->start($product, ['seo_description'], false);
        $generation->update([
            'status' => ProductSeoGeneration::STATUS_SUBMITTED,
            'external_job_id' => 'job-invalid',
        ]);

        Http::fake([
            'http://seo.test/api/generate/job-invalid' => Http::response([
                'job_id' => 'job-invalid',
                'status' => 'completed',
                'result' => ['seo_keyword' => 'legacy keyword'],
                'error' => null,
            ]),
        ]);

        (new PollProductSeoGeneration($generation->id))->handle(
            app(SeoDescriptionClient::class),
            $service,
        );

        $fresh = $generation->fresh();
        $this->assertSame(ProductSeoGeneration::STATUS_FAILED, $fresh->status);
        $this->assertSame(['seo_keyword' => 'legacy keyword'], $fresh->result);
        $this->assertStringContainsString('do not match', $fresh->error);
    }

    public function test_polling_stops_at_deadline_and_releases_active_slot(): void
    {
        Queue::fake();
        [, $product] = $this->adminAndProduct();
        $service = app(ProductSeoGenerationService::class);
        $generation = $service->start($product, ['seo_description'], false);
        $generation->update([
            'status' => ProductSeoGeneration::STATUS_SUBMITTED,
            'external_job_id' => 'job-timeout',
            'deadline_at' => now()->subSecond(),
        ]);

        (new PollProductSeoGeneration($generation->id))->handle(
            app(SeoDescriptionClient::class),
            $service,
        );

        $this->assertSame(ProductSeoGeneration::STATUS_FAILED, $generation->fresh()->status);
        $this->assertNull($generation->fresh()->active_product_id);
        $this->assertStringContainsString('время ожидания', $generation->fresh()->error);
    }

    public function test_generation_status_is_scoped_to_product(): void
    {
        Queue::fake();
        [$user, $product] = $this->adminAndProduct();
        $other = Product::query()->create([
            'brand_id' => $product->brand_id,
            'name' => 'Other',
            'slug' => 'other',
        ]);
        $generation = app(ProductSeoGenerationService::class)->start($product, ['seo_description'], false);
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/admin/products/'.$other->id.'/generate-seo/'.$generation->id)
            ->assertNotFound();
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
            'slug' => 'dior',
            'is_active' => true,
        ]);
        $product = Product::query()->create(array_merge([
            'brand_id' => $brand->id,
            'name' => 'Sauvage',
            'slug' => 'dior-sauvage',
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
        Schema::create('product_seo_generations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id');
            $table->foreignId('active_product_id')->nullable()->unique();
            $table->uuid('external_job_id')->nullable()->unique();
            $table->string('status', 30)->default('pending');
            $table->string('external_status', 30)->nullable();
            $table->json('requested_fields');
            $table->json('source_snapshot');
            $table->string('source_hash', 64);
            $table->json('result')->nullable();
            $table->text('error')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('deadline_at');
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }
}
