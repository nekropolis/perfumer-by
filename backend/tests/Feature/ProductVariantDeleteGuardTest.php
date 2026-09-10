<?php

namespace Tests\Feature;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Tests\TestCase;

class ProductVariantDeleteGuardTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();
        $this->createMinimalSchema();
        config()->set('services.catalog_search.enabled', false);
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('warehouse_variant_stocks');
            Schema::dropIfExists('warehouses');
            Schema::dropIfExists('product_variant_links');
            Schema::dropIfExists('products');
            Schema::dropIfExists('users');
        }

        parent::tearDown();
    }

    public function test_cannot_delete_variant_with_main_warehouse_stock(): void
    {
        $user = User::query()->create([
            'name' => 'Admin',
            'email' => 'admin-variant-delete@example.com',
            'password' => 'password',
            'role' => Role::ADMIN->value,
        ]);
        assert($user instanceof Authenticatable);
        $product = Product::withoutEvents(static fn () => Product::query()->create([
            'name' => 'Sauvage',
            'slug' => 'dior-sauvage-delete-guard',
        ]));
        $variant = ProductVariantLink::withoutEvents(static fn () => ProductVariantLink::query()->create([
            'product_id' => $product->id,
            'variant_definition_id' => 1,
            'stock' => 0,
            'is_active' => true,
        ]));
        $warehouse = Warehouse::withoutEvents(static fn () => Warehouse::query()->create([
            'code' => Warehouse::CODE_MAIN,
            'name' => 'Основной',
            'is_active' => true,
            'is_default' => true,
            'sort_order' => 0,
        ]));
        WarehouseVariantStock::withoutEvents(static fn () => WarehouseVariantStock::query()->create([
            'warehouse_id' => $warehouse->id,
            'product_id' => $product->id,
            'variant_id' => $variant->id,
            'stock' => 3,
            'reserved_stock' => 0,
        ]));

        $this->actingAs($user, 'sanctum');

        $this->deleteJson("/api/admin/products/{$product->id}/variants/{$variant->id}")
            ->assertStatus(422)
            ->assertJsonFragment([
                'variant' => ['Вариант на складе (3 шт.). Сначала спишите товар со склада.'],
            ]);

        $this->assertDatabaseHas('product_variant_links', ['id' => $variant->id]);
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
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_set')->default(false);
            $table->boolean('is_out_of_stock')->default(false);
            $table->decimal('listing_min_price', 12, 2)->nullable();
            $table->decimal('listing_max_price', 12, 2)->nullable();
            $table->timestamps();
        });
        Schema::create('product_variant_links', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_definition_id')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->decimal('old_price', 12, 2)->nullable();
            $table->integer('stock')->default(0);
            $table->integer('reserved_stock')->default(0);
            $table->boolean('is_preorder')->default(false);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_promotion')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
        Schema::create('warehouses', function (Blueprint $table): void {
            $table->id();
            $table->string('code');
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
        Schema::create('warehouse_variant_stocks', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('warehouse_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('variant_id');
            $table->integer('stock')->default(0);
            $table->integer('reserved_stock')->default(0);
            $table->timestamps();
        });
    }
}
