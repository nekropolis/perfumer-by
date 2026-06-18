<?php

namespace Modules\Catalog\Support;

use Illuminate\Support\Collection;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

/**
 * Batch-preloads warehouse stocks and supplier listing offers for a product listing page.
 */
final class CatalogListingStockContext
{
    private static ?self $instance = null;

    /** @var Collection<int, Collection<int, WarehouseVariantStock>> */
    private Collection $stocksByVariantId;

    /** @var array<int, list<SupplierVariantOffer>> */
    private array $eligibleOffersByVariantId = [];

    /** @var array<int, array<string, mixed>> */
    private array $presentedCache = [];

    private int $mainWarehouseId = 0;

    private int $supplierWarehouseId = 0;

    /**
     * @param  Collection<int, Collection<int, WarehouseVariantStock>>  $stocksByVariantId
     * @param  array<int, list<SupplierVariantOffer>>  $eligibleOffersByVariantId
     */
    private function __construct(
        Collection $stocksByVariantId,
        array $eligibleOffersByVariantId,
        int $mainWarehouseId,
        int $supplierWarehouseId,
    ) {
        $this->stocksByVariantId = $stocksByVariantId;
        $this->eligibleOffersByVariantId = $eligibleOffersByVariantId;
        $this->mainWarehouseId = $mainWarehouseId;
        $this->supplierWarehouseId = $supplierWarehouseId;
    }

    public static function prime(Collection $products): void
    {
        self::$instance = self::fromProducts($products);
    }

    public static function forget(): void
    {
        self::$instance = null;
    }

    public static function current(): ?self
    {
        return self::$instance;
    }

    /**
     * @param  Collection<int, Product>  $products
     */
    public static function fromProducts(Collection $products): self
    {
        $variants = $products
            ->flatMap(static function (Product $product): Collection {
                if (!$product->relationLoaded('activeVariants')) {
                    return collect();
                }

                return $product->activeVariants;
            })
            ->filter(static fn ($variant): bool => $variant instanceof ProductVariantLink);

        if ($variants->isEmpty()) {
            return new self(collect(), [], 0, 0);
        }

        $mainWarehouseId = self::warehouseIdByCode(Warehouse::CODE_MAIN);
        $supplierWarehouseId = self::warehouseIdByCode(Warehouse::CODE_SUPPLIER);
        $warehouseIds = array_values(array_filter([$mainWarehouseId, $supplierWarehouseId]));

        $variantIds = $variants
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        $stocksByVariantId = collect();
        if ($variantIds !== [] && $warehouseIds !== []) {
            $stocksByVariantId = WarehouseVariantStock::query()
                ->whereIn('variant_id', $variantIds)
                ->whereIn('warehouse_id', $warehouseIds)
                ->get()
                ->groupBy(static fn (WarehouseVariantStock $stock): int => (int) $stock->variant_id)
                ->map(static fn (Collection $rows): Collection => $rows->keyBy(
                    static fn (WarehouseVariantStock $stock): int => (int) $stock->warehouse_id
                ));
        }

        $eligibleOffersByVariantId = self::preloadEligibleOffers($variants, $variantIds);

        return new self(
            $stocksByVariantId,
            $eligibleOffersByVariantId,
            $mainWarehouseId,
            $supplierWarehouseId,
        );
    }

    /**
     * @return list<SupplierVariantOffer>
     */
    public function eligibleOffersForVariant(ProductVariantLink $variant): array
    {
        return $this->eligibleOffersByVariantId[(int) $variant->id] ?? [];
    }

    /**
     * @return array<string, mixed>
     */
    public function presentedForListing(ProductVariantLink $variant): array
    {
        $variantId = (int) $variant->id;
        if (array_key_exists($variantId, $this->presentedCache)) {
            return $this->presentedCache[$variantId];
        }

        $stocks = $this->stocksByVariantId->get($variantId, collect());
        $mainStock = $this->mainWarehouseId > 0 ? $stocks->get($this->mainWarehouseId) : null;
        $supplierStock = $this->supplierWarehouseId > 0 ? $stocks->get($this->supplierWarehouseId) : null;
        $offers = $this->eligibleOffersForVariant($variant);

        $this->presentedCache[$variantId] = CatalogVariantStockPresenter::forListing(
            $variant,
            $mainStock,
            $supplierStock,
            $offers,
        );

        return $this->presentedCache[$variantId];
    }

    /**
     * @return array{0: ?WarehouseVariantStock, 1: ?WarehouseVariantStock}
     */
    public function warehouseStocksForVariant(ProductVariantLink $variant): array
    {
        $stocks = $this->stocksByVariantId->get((int) $variant->id, collect());

        return [
            $this->mainWarehouseId > 0 ? $stocks->get($this->mainWarehouseId) : null,
            $this->supplierWarehouseId > 0 ? $stocks->get($this->supplierWarehouseId) : null,
        ];
    }

    public function storefrontVariantPrice(ProductVariantLink $variant, array $presented): ?float
    {
        return CatalogVariantStockPresenter::storefrontVariantPrice(
            $variant,
            $presented,
            $this->eligibleOffersForVariant($variant),
        );
    }

    /**
     * @param  Collection<int, ProductVariantLink>  $variants
     * @param  list<int>  $variantIds
     * @return array<int, list<SupplierVariantOffer>>
     */
    private static function preloadEligibleOffers(Collection $variants, array $variantIds): array
    {
        if ($variantIds === []) {
            return [];
        }

        $productIdByVariantId = $variants
            ->mapWithKeys(static fn (ProductVariantLink $variant): array => [
                (int) $variant->id => (int) $variant->product_id,
            ])
            ->all();

        $offers = SupplierVariantOffer::query()
            ->whereIn('product_variant_id', $variantIds)
            ->where('is_active', true)
            ->get(['id', 'product_variant_id', 'supplier_id', 'price', 'purchase_price', 'payload']);

        if ($offers->isEmpty()) {
            return [];
        }

        $productIds = array_values(array_unique(array_filter(array_values($productIdByVariantId))));
        $supplierIds = $offers
            ->pluck('supplier_id')
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        $linkedPairs = [];
        if ($productIds !== [] && $supplierIds !== []) {
            $linkedPairs = SupplierProduct::query()
                ->whereIn('product_id', $productIds)
                ->whereIn('supplier_id', $supplierIds)
                ->where('is_linked', true)
                ->where('is_active', true)
                ->where('link_parsing_active', true)
                ->get(['product_id', 'supplier_id'])
                ->map(static fn (SupplierProduct $row): string => (int) $row->product_id . ':' . (int) $row->supplier_id)
                ->flip()
                ->all();
        }

        $eligibleByVariantId = [];
        foreach ($offers as $offer) {
            $variantId = (int) $offer->product_variant_id;
            $productId = (int) ($productIdByVariantId[$variantId] ?? 0);
            if ($productId <= 0) {
                continue;
            }

            $payload = is_array($offer->payload) ? $offer->payload : [];
            if (CatalogVariantStockPresenter::supplierOfferPayloadBlocksListing($payload)) {
                continue;
            }

            $pairKey = $productId . ':' . (int) $offer->supplier_id;
            if (!array_key_exists($pairKey, $linkedPairs)) {
                continue;
            }

            $eligibleByVariantId[$variantId] ??= [];
            $eligibleByVariantId[$variantId][] = $offer;
        }

        return $eligibleByVariantId;
    }

    private static function warehouseIdByCode(string $code): int
    {
        static $cache = [];

        if (!array_key_exists($code, $cache)) {
            $cache[$code] = (int) Warehouse::query()->where('code', $code)->value('id');
        }

        return $cache[$code];
    }
}
