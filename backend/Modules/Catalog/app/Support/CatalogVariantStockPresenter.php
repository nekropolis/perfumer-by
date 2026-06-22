<?php

namespace Modules\Catalog\Support;

use Illuminate\Database\Eloquent\Builder;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Warehouse\Models\Warehouse;
use Modules\Warehouse\Models\WarehouseVariantStock;

/**
 * Остаток для витрины и корзины: основной склад — физика + резерв;
 * склад «Поставщик» при активной связке в прайсе не ограничивается резервом
 * (резерв ведётся в warehouse_variant_stocks, но покупателю канал поставщика — «много»).
 */
final class CatalogVariantStockPresenter
{
    /** Достаточно большое число для UI «в наличии» с поставщика (реальные заказы не режем по этому лимиту на бэке). */
    public const SUPPLIER_LISTING_QTY = 9999;

    /**
     * Варианты, которые реально попадают на витрину: предзаказ, либо активный вариант
     * с остатком на складе (main/supplier) или активной привязкой к прайсу поставщика.
     *
     * @param  Builder<ProductVariantLink>  $query
     */
    public static function applyStorefrontListingEligibleScope(Builder $query): void
    {
        $query->where(function (Builder $outer): void {
            $outer->where('is_preorder', true)
                ->orWhere(function (Builder $inner): void {
                    $inner->where('is_active', true)
                        ->where(function (Builder $channel): void {
                            $channel->whereHas('warehouseStocks', function (Builder $stockQuery): void {
                                $stockQuery
                                    ->whereRaw('(stock - COALESCE(reserved_stock, 0)) > 0')
                                    ->whereHas('warehouse', function (Builder $warehouseQuery): void {
                                        $warehouseQuery->whereIn('code', [
                                            Warehouse::CODE_MAIN,
                                            Warehouse::CODE_SUPPLIER,
                                        ]);
                                    });
                            })->orWhereHas('supplierOffers', function (Builder $offerQuery): void {
                                self::applySupplierOfferListingScope($offerQuery);
                            });
                        });
                });
        });
    }

    /**
     * Флаги в payload оффера поставщика, при которых витрина не считает позицию доступной по каналу прайса.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function supplierOfferPayloadBlocksListing(array $payload): bool
    {
        if (!empty($payload['missing_in_latest_price'])) {
            return true;
        }

        // Связка из парсинга Seller One: витрина по прайсу только после «Обновить цены».
        if (!empty($payload['seller_one_listing_deferred'])) {
            return true;
        }

        return !empty($payload['out_of_stock_in_price_file']);
    }

    /**
     * Розничная цена для карточки/списка: не отдаём «висячую» цену от поставщика,
     * если вариант сейчас нельзя купить (нет остатка и нет канала прайса) и это не предзаказ.
     *
     * @param  array<string, mixed>  $presented  результат {@see forListing()}
     */
    /**
     * @param  list<SupplierVariantOffer>|null  $preloadedEligibleOffers
     */
    public static function storefrontVariantPrice(
        ProductVariantLink $variant,
        array $presented,
        ?array $preloadedEligibleOffers = null,
    ): ?float {
        if (!$presented['is_available'] && !(bool) $variant->is_preorder) {
            return null;
        }

        if (!empty($presented['supplier_listing_price'])) {
            $minOfferPrice = self::minListingRetailPrice($variant, $preloadedEligibleOffers);
            if ($minOfferPrice !== null) {
                return $minOfferPrice;
            }
        }

        return $variant->price !== null ? (float) $variant->price : null;
    }

    /**
     * Минимальная розничная цена среди офферов, участвующих в канале прайса на витрине.
     *
     * @param  list<SupplierVariantOffer>|null  $preloadedEligibleOffers
     */
    public static function minListingRetailPrice(ProductVariantLink $variant, ?array $preloadedEligibleOffers = null): ?float
    {
        $min = null;

        foreach (self::listingEligibleOffers($variant, $preloadedEligibleOffers) as $offer) {
            if ($offer->price === null || !is_numeric((string) $offer->price)) {
                continue;
            }

            $retail = (float) $offer->price;
            if ($retail <= 0) {
                continue;
            }

            $min = $min === null ? $retail : min($min, $retail);
        }

        return $min;
    }

    /**
     * Офферы поставщика, участвующие в канале прайса (как в {@see Product::activeVariants()}).
     *
     * @param  Builder<SupplierVariantOffer>  $query
     */
    public static function applySupplierOfferListingScope(Builder $query): void
    {
        $query->where('is_active', true)
            ->where(function ($w) {
                $w->whereNull('payload->missing_in_latest_price')
                    ->orWhere('payload->missing_in_latest_price', false);
            })
            ->where(function ($w) {
                $w->whereNull('payload->out_of_stock_in_price_file')
                    ->orWhere('payload->out_of_stock_in_price_file', false);
            })
            ->where(function ($w) {
                $w->whereNull('payload->seller_one_listing_deferred')
                    ->orWhere('payload->seller_one_listing_deferred', false);
            })
            ->whereExists(function ($sub) {
                $sub->selectRaw('1')
                    ->from('supplier_products as sp')
                    ->whereColumn('sp.supplier_id', 'supplier_variant_offers.supplier_id')
                    ->whereColumn('sp.product_id', 'product_variant_links.product_id')
                    ->where('sp.is_linked', '=', true)
                    ->where('sp.is_active', '=', true)
                    ->where('sp.link_parsing_active', '=', true);
            });
    }

    /**
     * @param  list<SupplierVariantOffer>|null  $preloadedEligibleOffers
     */
    public static function supplierListingActive(ProductVariantLink $variant, ?array $preloadedEligibleOffers = null): bool
    {
        if ($preloadedEligibleOffers !== null) {
            return $preloadedEligibleOffers !== [];
        }

        foreach (self::listingEligibleOffers($variant) as $_offer) {
            return true;
        }

        return false;
    }

    /**
     * Минимальная закупочная цена среди офферов, участвующих в канале прайса на витрине.
     */
    public static function minListingPurchasePrice(ProductVariantLink $variant): ?float
    {
        $min = null;

        foreach (self::listingEligibleOffers($variant, null) as $offer) {
            $payload = is_array($offer->payload) ? $offer->payload : [];
            $purchase = self::resolveOfferPurchasePrice($offer, $payload);
            if ($purchase === null || $purchase <= 0) {
                continue;
            }

            $min = $min === null ? $purchase : min($min, $purchase);
        }

        return $min;
    }

    /**
     * @param  list<SupplierVariantOffer>|null  $preloadedEligibleOffers
     * @return iterable<int, SupplierVariantOffer>
     */
    private static function listingEligibleOffers(ProductVariantLink $variant, ?array $preloadedEligibleOffers = null): iterable
    {
        if ($preloadedEligibleOffers !== null) {
            yield from $preloadedEligibleOffers;

            return;
        }

        $offers = SupplierVariantOffer::query()
            ->where('product_variant_id', $variant->id)
            ->where('is_active', true)
            ->get(['id', 'supplier_id', 'price', 'purchase_price', 'payload']);

        foreach ($offers as $offer) {
            $payload = is_array($offer->payload) ? $offer->payload : [];
            if (self::supplierOfferPayloadBlocksListing($payload)) {
                continue;
            }

            $linked = SupplierProduct::query()
                ->where('product_id', $variant->product_id)
                ->where('supplier_id', $offer->supplier_id)
                ->where('is_linked', true)
                ->where('is_active', true)
                ->where('link_parsing_active', true)
                ->exists();

            if ($linked) {
                yield $offer;
            }
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private static function resolveOfferPurchasePrice(SupplierVariantOffer $offer, array $payload): ?float
    {
        $raw = $payload['supplier_price'] ?? $offer->purchase_price;
        if ($raw === null || !is_numeric((string) $raw)) {
            return null;
        }

        return (float) $raw;
    }

    /**
     * @return array{
     *     stock: int,
     *     reserved_stock: int,
     *     available_stock: int,
     *     is_available: bool,
     *     is_preorder: bool,
     *     supplier_listing_price: bool
     * }
     */
    /**
     * @param  list<SupplierVariantOffer>|null  $preloadedEligibleOffers
     * @return array{
     *     stock: int,
     *     reserved_stock: int,
     *     available_stock: int,
     *     is_available: bool,
     *     is_preorder: bool,
     *     supplier_listing_price: bool
     * }
     */
    public static function forListing(
        ProductVariantLink $variant,
        ?WarehouseVariantStock $mainStock,
        ?WarehouseVariantStock $supplierStock,
        ?array $preloadedEligibleOffers = null,
    ): array {
        $preorder = (bool) $variant->is_preorder;

        $mainAvailable = $mainStock
            ? max(0, (int) $mainStock->stock - (int) $mainStock->reserved_stock)
            : 0;

        if ($mainAvailable > 0) {
            return [
                'stock' => (int) $mainStock->stock,
                'reserved_stock' => (int) $mainStock->reserved_stock,
                'available_stock' => $mainAvailable,
                'is_available' => $mainAvailable > 0 || $preorder,
                'is_preorder' => $preorder,
                'supplier_listing_price' => false,
            ];
        }

        // Канал поставщика по активной связке прайса (строка склада может ещё не существовать).
        if (self::supplierListingActive($variant, $preloadedEligibleOffers)) {
            return [
                'stock' => self::SUPPLIER_LISTING_QTY,
                'reserved_stock' => 0,
                'available_stock' => self::SUPPLIER_LISTING_QTY,
                'is_available' => true,
                'is_preorder' => $preorder,
                'supplier_listing_price' => true,
            ];
        }

        if ($supplierStock) {
            $supplierAvailable = max(
                0,
                (int) $supplierStock->stock - (int) $supplierStock->reserved_stock
            );

            return [
                'stock' => (int) $supplierStock->stock,
                'reserved_stock' => (int) $supplierStock->reserved_stock,
                'available_stock' => $supplierAvailable,
                'is_available' => $supplierAvailable > 0 || $preorder,
                'is_preorder' => $preorder,
                'supplier_listing_price' => false,
            ];
        }

        return [
            'stock' => 0,
            'reserved_stock' => 0,
            'available_stock' => 0,
            'is_available' => $preorder,
            'is_preorder' => $preorder,
            'supplier_listing_price' => false,
        ];
    }
}
