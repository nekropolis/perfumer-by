<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Tests\TestCase;

/**
 * Батч-загрузчик офферов канала прайса должен давать ровно то же, что построчный
 * путь: он подставляется в списки вместо N+1, и расхождение сразу поехало бы в UI.
 */
class CatalogVariantEligibleOffersBatchTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('product_variant_links', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->timestamps();
        });

        Schema::create('supplier_variant_offers', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('product_variant_id');
            $table->string('external_id')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->decimal('purchase_price', 12, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        Schema::create('supplier_products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->boolean('is_linked')->default(false);
            $table->boolean('is_active')->default(true);
            $table->boolean('link_parsing_active')->default(true);
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('supplier_products');
            Schema::dropIfExists('supplier_variant_offers');
            Schema::dropIfExists('product_variant_links');
        }

        parent::tearDown();
    }

    public function test_batch_loader_matches_per_variant_path(): void
    {
        // 1 — оффер со связкой: канал активен.
        // 2 — оффер есть, связки поставщика нет: канал неактивен.
        // 3 — связка есть, но оффер отложен (seller_one_listing_deferred).
        // 4 — оффер выключен (is_active = false).
        // 5 — офферов нет вовсе.
        $this->makeVariant(1, 101);
        $this->makeVariant(2, 102);
        $this->makeVariant(3, 103);
        $this->makeVariant(4, 104);
        $this->makeVariant(5, 105);

        $this->makeOffer(1, 7, 1, ['supplier_price' => 10]);
        $this->makeOffer(2, 7, 2, ['supplier_price' => 20]);
        $this->makeOffer(3, 7, 3, ['seller_one_listing_deferred' => true]);
        $this->makeOffer(4, 7, 4, ['supplier_price' => 40], false);

        $this->makeSupplierProduct(7, 101);
        $this->makeSupplierProduct(7, 103);
        $this->makeSupplierProduct(7, 104);
        // Для 102 связки нет; для 105 нет ни оффера, ни связки.

        $variants = ProductVariantLink::query()->orderBy('id')->get();
        $batch = CatalogVariantStockPresenter::eligibleOffersForVariants($variants);

        foreach ($variants as $variant) {
            $this->assertSame(
                CatalogVariantStockPresenter::supplierListingActive($variant),
                CatalogVariantStockPresenter::supplierListingActive($variant, $batch[$variant->id] ?? []),
                "Расхождение батча и построчного пути для варианта #{$variant->id}",
            );
        }

        $this->assertSame([1], array_keys(array_filter($batch, fn (array $offers): bool => $offers !== [])));
    }

    public function test_link_parsing_disabled_removes_channel(): void
    {
        $this->makeVariant(1, 101);
        $this->makeOffer(1, 7, 1, ['supplier_price' => 10]);
        $this->makeSupplierProduct(7, 101, linkParsingActive: false);

        $variants = ProductVariantLink::query()->get();
        $batch = CatalogVariantStockPresenter::eligibleOffersForVariants($variants);

        $this->assertSame([], $batch[1]);
        $this->assertFalse(CatalogVariantStockPresenter::supplierListingActive($variants->first()));
    }

    public function test_empty_input_returns_empty_map(): void
    {
        $this->assertSame([], CatalogVariantStockPresenter::eligibleOffersForVariants(collect()));
    }

    private function makeVariant(int $id, int $productId): void
    {
        DB::table('product_variant_links')->insert([
            'id' => $id,
            'product_id' => $productId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function makeOffer(int $id, int $supplierId, int $variantId, array $payload, bool $isActive = true): void
    {
        DB::table('supplier_variant_offers')->insert([
            'id' => $id,
            'supplier_id' => $supplierId,
            'product_variant_id' => $variantId,
            'external_id' => 'code-'.$id,
            'price' => 100,
            'purchase_price' => 50,
            'is_active' => $isActive,
            'payload' => json_encode($payload),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function makeSupplierProduct(
        int $supplierId,
        int $productId,
        bool $linkParsingActive = true,
    ): void {
        DB::table('supplier_products')->insert([
            'supplier_id' => $supplierId,
            'product_id' => $productId,
            'is_linked' => true,
            'is_active' => true,
            'link_parsing_active' => $linkParsingActive,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
