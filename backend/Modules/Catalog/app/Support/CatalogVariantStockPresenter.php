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

    public static function supplierListingActive(ProductVariantLink $variant): bool
    {
        $offer = SupplierVariantOffer::query()
            ->where('product_variant_id', $variant->id)
            ->where('is_active', true)
            ->first();

        if (!$offer) {
            return false;
        }

        return SupplierProduct::query()
            ->where('product_id', $variant->product_id)
            ->where('supplier_id', $offer->supplier_id)
            ->where('is_linked', true)
            ->where('is_active', true)
            ->exists();
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

        if ($supplierStock && self::supplierListingActive($variant)) {
            return [
                'stock' => self::SUPPLIER_LISTING_QTY,
                'reserved_stock' => 0,
                'available_stock' => self::SUPPLIER_LISTING_QTY,
                'is_available' => true,
                'is_preorder' => $preorder,
            ];
        }

        $supplierAvailable = $supplierStock
            ? max(0, (int) $supplierStock->stock - (int) $supplierStock->reserved_stock)
            : 0;

        $fallbackAvailable = max(0, (int) $variant->stock - (int) ($variant->reserved_stock ?? 0));

        if ($supplierStock) {
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
