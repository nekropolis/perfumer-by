<?php

namespace Modules\Catalog\Services;

use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Support\CatalogVariantStockPresenter;

/**
 * Синхронизация розничной цены варианта с минимальной закупкой среди офферов на витрине.
 */
final class VariantSupplierRetailPriceService
{
    /**
     * @param  callable(float): float  $retailFromPurchase
     */
    public function syncFromListingOffers(ProductVariantLink $variant, callable $retailFromPurchase): ?float
    {
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
