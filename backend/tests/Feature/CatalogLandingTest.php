<?php

namespace Tests\Feature;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\CatalogLanding;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeOption;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;
use Tests\TestCase;

class CatalogLandingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();
        $this->createSchema();
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('catalog_landings');
            Schema::dropIfExists('product_attribute_options');
            Schema::dropIfExists('product_attributes');
            Schema::dropIfExists('users');
        }

        parent::tearDown();
    }

    public function test_public_show_returns_active_landing(): void
    {
        CatalogLanding::query()->create([
            'slug' => 'zimnie-aromaty',
            'gender' => 'female',
            'filters' => ['18' => [699]],
            'h1' => 'Зимние ароматы',
            'seo_title' => 'Зимние ароматы — каталог',
            'seo_description' => 'Описание',
            'content' => '<p>Текст</p>',
            'is_active' => true,
        ]);

        $this->getJson('/api/catalog/landings/zimnie-aromaty')
            ->assertOk()
            ->assertJsonPath('data.slug', 'zimnie-aromaty')
            ->assertJsonPath('data.gender', 'female')
            ->assertJsonPath('data.filters', ['18' => [699]])
            ->assertJsonPath('data.h1', 'Зимние ароматы');
    }

    public function test_public_show_returns_404_for_inactive_landing(): void
    {
        CatalogLanding::query()->create([
            'slug' => 'hidden',
            'h1' => 'Hidden',
            'seo_title' => 'Hidden',
            'is_active' => false,
        ]);

        $this->getJson('/api/catalog/landings/hidden')->assertNotFound();
    }

    public function test_admin_create_validates_filters_against_attributes(): void
    {
        $user = $this->adminUser();
        $attribute = ProductAttribute::query()->create(['name' => 'Тип']);
        ProductAttributeOption::query()->create([
            'product_attribute_id' => $attribute->id,
            'name' => 'Духи',
        ]);

        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/admin/catalog-landings', [
            'slug' => 'test-landing',
            'h1' => 'Test',
            'seo_title' => 'Test SEO',
            'filters' => [
                (string) $attribute->id => [999999],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('filters');

        $option = ProductAttributeOption::query()->firstOrFail();

        $this->postJson('/api/admin/catalog-landings', [
            'slug' => 'test-landing',
            'h1' => 'Test',
            'seo_title' => 'Test SEO',
            'gender' => 'unisex',
            'filters' => [
                (string) $attribute->id => [$option->id],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.slug', 'test-landing')
            ->assertJsonPath('data.gender', 'unisex');
    }

    public function test_admin_update_validates_required_fields(): void
    {
        $user = $this->adminUser();
        $this->actingAs($user, 'sanctum');

        $landing = CatalogLanding::query()->create([
            'slug' => 'old-slug',
            'h1' => 'Old',
            'seo_title' => 'Old SEO',
            'is_active' => true,
        ]);

        $this->putJson('/api/admin/catalog-landings/'.$landing->id, [
            'slug' => '',
            'h1' => '',
            'seo_title' => '',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['slug', 'h1', 'seo_title']);
    }

    private function adminUser(): Authenticatable
    {
        return User::query()->create([
            'name' => 'Admin',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password',
            'role' => Role::ADMIN->value,
        ]);
    }

    private function createSchema(): void
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

        Schema::create('catalog_landings', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->string('gender', 32)->nullable();
            $table->text('filters')->nullable();
            $table->string('h1');
            $table->string('seo_title');
            $table->text('seo_description')->nullable();
            $table->longText('content')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });
    }
}
