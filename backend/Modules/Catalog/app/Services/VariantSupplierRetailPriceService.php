<?php

namespace Modules\Catalog\Services;

use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Services\Pricing\PriceFormulaResolver;
use Modules\Catalog\Services\Pricing\WarehousePurchasePriceResolver;
use Modules\Catalog\Support\CatalogVariantStockPresenter;

/**
 * Синхронизация розничной цены варианта с минимальной закупкой среди офферов на витрине.
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
}
