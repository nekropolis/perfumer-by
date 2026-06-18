<?php

namespace Modules\Catalog\Services;

use Modules\Catalog\Models\Product;

class ListingMinPriceService
{
    public function syncForProduct(int $productId): void
    {
        if ($productId <= 0) {
            return;
        }

        $product = Product::query()->find($productId);
        if ($product === null) {
            return;
        }

        $bounds = $product->activeVariants()
            ->whereNotNull('price')
            ->selectRaw('MIN(price) as listing_min, MAX(price) as listing_max')
            ->first();

        $minPrice = $bounds?->listing_min;
        $maxPrice = $bounds?->listing_max;

        $nextMin = $minPrice !== null ? (string) $minPrice : null;
        $nextMax = $maxPrice !== null ? (string) $maxPrice : null;
        $currentMin = $product->listing_min_price !== null ? (string) $product->listing_min_price : null;
        $currentMax = $product->listing_max_price !== null ? (string) $product->listing_max_price : null;

        if ($currentMin === $nextMin && $currentMax === $nextMax) {
            return;
        }

        $product->forceFill([
            'listing_min_price' => $minPrice,
            'listing_max_price' => $maxPrice,
        ])->saveQuietly();
    }

    public function syncAll(int $chunkSize = 200): int
    {
        $updated = 0;

        Product::query()
            ->select(['id'])
            ->orderBy('id')
            ->chunkById($chunkSize, function ($products) use (&$updated): void {
                foreach ($products as $product) {
                    $before = Product::query()
                        ->whereKey($product->id)
                        ->first(['listing_min_price', 'listing_max_price']);
                    $this->syncForProduct((int) $product->id);
                    $after = Product::query()
                        ->whereKey($product->id)
                        ->first(['listing_min_price', 'listing_max_price']);

                    if (
                        (string) ($before?->listing_min_price ?? '') !== (string) ($after?->listing_min_price ?? '')
                        || (string) ($before?->listing_max_price ?? '') !== (string) ($after?->listing_max_price ?? '')
                    ) {
                        $updated++;
                    }
                }
            });

        return $updated;
    }
}
