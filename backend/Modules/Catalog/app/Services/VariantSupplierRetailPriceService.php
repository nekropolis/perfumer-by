<?php

namespace Modules\Catalog\Services;

use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Services\Pricing\PriceFormulaResolver;
use Modules\Catalog\Services\Pricing\WarehousePurchasePriceResolver;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Warehouse\Models\WarehouseVariantStock;

/**
 * Синхронизация розничной цены варианта с минимальной закупкой среди офферов на витрине.
 * При наличии остатка на основном складе цену не трогаем — её задаёт складской refresh.
 */
final class VariantSupplierRetailPriceService
{
    public function __construct(
        private readonly PriceFormulaResolver $formulaResolver,
        private readonly WarehousePurchasePriceResolver $purchasePriceResolver,
    ) {
    }

    /**
     * @param  callable(float): float  $retailFromPurchase
     */
    public function syncFromListingOffers(ProductVariantLink $variant, callable $retailFromPurchase): ?float
    {
        $mainWarehouseId = $this->purchasePriceResolver->resolveMainWarehouseId();
        if ($mainWarehouseId > 0
            && $this->formulaResolver->shouldSkipVariantPrice(
                $variant,
                PriceFormula::SOURCE_WAREHOUSE,
                $mainWarehouseId,
            )
        ) {
            return $variant->price !== null ? (float) $variant->price : null;
        }

        // Складской refresh уже выставил розницу по правилам склада / gap — не перезаписывать офером.
        if ($mainWarehouseId > 0 && $this->hasMainWarehouseAvailableStock((int) $variant->id, $mainWarehouseId)) {
            return $variant->price !== null ? (float) $variant->price : null;
        }

        $minPurchase = CatalogVariantStockPresenter::minListingPurchasePrice($variant);
        if ($minPurchase === null) {
            return null;
        }

        $retail = round($retailFromPurchase($minPurchase), 2);
        $current = $variant->price !== null ? (float) $variant->price : null;
        if ($current !== null && abs($current - $retail) < 0.004) {
            return $current;
        }

        $variant->update(['price' => $retail]);

        return $retail;
    }

    private function hasMainWarehouseAvailableStock(int $variantId, int $mainWarehouseId): bool
    {
        if ($variantId <= 0 || $mainWarehouseId <= 0) {
            return false;
        }

        return WarehouseVariantStock::query()
            ->where('warehouse_id', $mainWarehouseId)
            ->where('variant_id', $variantId)
            ->where('stock', '>', 0)
            ->exists();
    }
}
