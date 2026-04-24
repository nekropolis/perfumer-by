<?php

namespace Modules\Catalog\Support;

use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
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
     * Флаги в payload оффера поставщика, при которых витрина не считает позицию доступной по каналу прайса.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function supplierOfferPayloadBlocksListing(array $payload): bool
    {
        if (!empty($payload['missing_in_latest_price'])) {
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
    public static function storefrontVariantPrice(ProductVariantLink $variant, array $presented): ?float
    {
        if ($presented['is_available'] || (bool) $variant->is_preorder) {
            return $variant->price !== null ? (float) $variant->price : null;
        }

        return null;
    }

    public static function supplierListingActive(ProductVariantLink $variant): bool
    {
        $offers = SupplierVariantOffer::query()
            ->where('product_variant_id', $variant->id)
            ->where('is_active', true)
            ->get(['id', 'supplier_id', 'payload']);

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
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{
     *     stock: int,
     *     reserved_stock: int,
     *     available_stock: int,
     *     is_available: bool,
     *     is_preorder: bool
     * }
     */
    public static function forListing(
        ProductVariantLink $variant,
        ?WarehouseVariantStock $mainStock,
        ?WarehouseVariantStock $supplierStock,
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
            ];
        }

        // Канал поставщика по активной связке прайса (строка склада может ещё не существовать).
        if (self::supplierListingActive($variant)) {
            return [
                'stock' => self::SUPPLIER_LISTING_QTY,
                'reserved_stock' => 0,
                'available_stock' => self::SUPPLIER_LISTING_QTY,
                'is_available' => true,
                'is_preorder' => $preorder,
            ];
        }

        $fallbackAvailable = max(0, (int) $variant->stock - (int) ($variant->reserved_stock ?? 0));

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
            ];
        }

        return [
            'stock' => (int) $variant->stock,
            'reserved_stock' => (int) ($variant->reserved_stock ?? 0),
            'available_stock' => $fallbackAvailable,
            'is_available' => $fallbackAvailable > 0 || $preorder,
            'is_preorder' => $preorder,
        ];
    }
}
