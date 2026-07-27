<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Support\MoneyDecimal;

/**
 * Snap sellable retail (−13%) onto sorted allparfume shop offer prices.
 */
final class AllparfumeOfferSnap
{
    /**
     * @param  list<string>  $sortedOfferPrices  ascending normalized prices
     * @return array{index:int,price:string,role:string}|null  null = above all offers
     */
    public static function select(string $sellable, array $sortedOfferPrices): ?array
    {
        if ($sortedOfferPrices === []) {
            return null;
        }

        $sellable = MoneyDecimal::normalize($sellable);
        $minPrice = MoneyDecimal::normalize($sortedOfferPrices[0]);

        if (MoneyDecimal::isLessThan($sellable, $minPrice)) {
            return [
                'index' => 0,
                'price' => $minPrice,
                'role' => 'snap_min',
            ];
        }

        foreach ($sortedOfferPrices as $index => $raw) {
            $price = MoneyDecimal::normalize($raw);
            if (MoneyDecimal::compare($price, $sellable) >= 0) {
                return [
                    'index' => $index,
                    'price' => $price,
                    'role' => $index === 0 ? 'snap_min' : 'snap_offer',
                ];
            }
        }

        return null;
    }
}
