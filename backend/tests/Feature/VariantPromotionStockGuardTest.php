<?php

namespace Tests\Feature;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Services\Pricing\VariantPromotionService;
use Modules\Catalog\Services\VariantSupplierRetailPriceService;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Tests\TestCase;

class VariantPromotionStockGuardTest extends TestCase
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

    public function test_cannot_enable_promotion_without_main_stock(): void
    {
        [$user, $product, $variant] = $this->seedProductVariant();
        $this->actingAs($user, 'sanctum');

        $this->putJson("/api/admin/products/{$product->id}/variants/{$variant->id}", [
            'is_promotion' => true,
        ])
            ->assertStatus(422)
            ->assertJsonFragment([
                'is_promotion' => ['Акцию можно включить только при свободном остатке на основном складе (не в резерве).'],
            ]);
    }

    public function test_cannot_enable_promotion_when_all_stock_is_reserved(): void
    {
        [$user, $product, $variant] = $this->seedProductVariant();
        $this->seedMainStock($product, $variant, stock: 2, reserved: 2);
        $this->actingAs($user, 'sanctum');

        $this->putJson("/api/admin/products/{$product->id}/variants/{$variant->id}", [
            'is_promotion' => true,
        ])
            ->assertStatus(422)
            ->assertJsonFragment([
                'is_promotion' => ['Акцию можно включить только при свободном остатке на основном складе (не в резерве).'],
            ]);
    }

    public function test_available_stock_requires_free_qty_not_just_physical(): void
    {
        [, $product, $variant] = $this->seedProductVariant();
        $warehouse = $this->seedMainStock($product, $variant, stock: 3, reserved: 3);
        $service = app(VariantPromotionService::class);

        $this->assertFalse($service->hasMainWarehouseAvailableStock((int) $variant->id));

        $row = WarehouseVariantStock::query()
            ->where('warehouse_id', $warehouse->id)
            ->where('variant_id', $variant->id)
            ->first();
        $this->assertNotNull($row);
        WarehouseVariantStock::withoutEvents(static function () use ($row): void {
            $row->update(['reserved_stock' => 2]);
        });

        $this->assertTrue($service->hasMainWarehouseAvailableStock((int) $variant->id));
    }

    public function test_clears_promotion_and_old_price_when_last_qty_reserved(): void
    {
        [, $product, $variant] = $this->seedProductVariant([
            'is_promotion' => true,
            'price' => '99.00',
            'old_price' => '150.00',
        ]);
        $this->seedMainStock($product, $variant, stock: 1, reserved: 1);

        $this->app->instance(VariantSupplierRetailPriceService::class, new class {
            public function syncFromListingOffers(ProductVariantLink $variant, callable $retailFromPurchase): ?float
            {
                return $variant->price !== null ? (float) $variant->price : null;
            }
        });

        ProductVariantLink::withoutEvents(function () use ($variant): void {
            app(VariantPromotionService::class)->clearPromotionIfMainWarehouseEmpty((int) $variant->id);
        });

        $variant->refresh();
        $this->assertFalse((bool) $variant->is_promotion);
        $this->assertNull($variant->old_price);
        $this->assertSame('99.00', (string) $variant->price);
    }

    public function test_keeps_promotion_while_free_stock_remains(): void
    {
        [, $product, $variant] = $this->seedProductVariant([
            'is_promotion' => true,
            'old_price' => '150.00',
        ]);
        $this->seedMainStock($product, $variant, stock: 2, reserved: 1);

        ProductVariantLink::withoutEvents(function () use ($variant): void {
            $cleared = app(VariantPromotionService::class)->clearPromotionIfMainWarehouseEmpty((int) $variant->id);
            $this->assertFalse($cleared);
        });

        $variant->refresh();
        $this->assertTrue((bool) $variant->is_promotion);
        $this->assertSame('150.00', (string) $variant->old_price);
    }

    /**
     * @param  array<string, mixed>  $variantAttrs
     * @return array{0: User&Authenticatable, 1: Product, 2: ProductVariantLink}
     */
    private function seedProductVariant(array $variantAttrs = []): array
    {
        $user = User::query()->create([
            'name' => 'Admin',
            'email' => 'admin-variant-promo@example.com',
            'password' => 'password',
            'role' => Role::ADMIN->value,
        ]);
        assert($user instanceof Authenticatable);
        $product = Product::withoutEvents(static fn () => Product::query()->create([
            'name' => 'Sauvage',
            'slug' => 'dior-sauvage-promo-guard',
        ]));
        $variant = ProductVariantLink::withoutEvents(static fn () => ProductVariantLink::query()->create([
            'product_id' => $product->id,
            'variant_definition_id' => 1,
            'stock' => 0,
            'is_active' => true,
            'is_promotion' => false,
            ...$variantAttrs,
        ]));

        return [$user, $product, $variant];
    }

    private function seedMainStock(Product $product, ProductVariantLink $variant, int $stock, int $reserved): Warehouse
    {
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
            'stock' => $stock,
            'reserved_stock' => $reserved,
        ]));

        return $warehouse;
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
