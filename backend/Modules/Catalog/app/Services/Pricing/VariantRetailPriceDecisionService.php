<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\WarehouseManualPriceReview;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\ImportExport\Models\AllparfumeShopOffer;
use Modules\ImportExport\Models\AllparfumeVariant;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePricingService;

/**
 * Единое решение розничной цены: allparfume (приоритет) или склад.
 *
 * @phpstan-type OfferRow array{
 *     shop_key:string,
 *     shop_name:string,
 *     price:string,
 *     role:?string,
 *     selected:bool,
 *     include_in_pricing?:bool
 * }
 * @phpstan-type Decision array{
 *     role: 'allparfume'|'ordinary',
 *     input_price: ?string,
 *     proposed_site_price: ?string,
 *     sellable_price: ?string,
 *     apply: bool,
 *     manual: ?array{
 *         reason: string,
 *         manual_retail_price: ?string,
 *         list_on_storefront: bool
 *     },
 *     allparfume: ?array{
 *         allparfume_variant_id: int,
 *         selected_offer_role: ?string,
 *         selected_purchase: ?string,
 *         selected_shop_name: ?string,
 *         offers: list<OfferRow>
 *     },
 *     warehouse: ?array{
 *         warehouse_purchase: ?string,
 *         supplier_purchase: ?string,
 *         formula_input: ?string,
 *         path: string
 *     }
 * }
 */
final class VariantRetailPriceDecisionService
{
    public function __construct(
        private readonly SellerOnePricingService $sellerOnePricing,
        private readonly PriceFormulaResolver $formulaResolver,
        private readonly WarehousePurchasePriceResolver $purchasePriceResolver,
    ) {
    }

    /**
     * @param  list<AllparfumeShopOffer>|null  $preloadedOffers
     * @return Decision
     */
    public function decide(
        ProductVariantLink $variant,
        ?float $warehousePurchase,
        ?float $supplierListingMinPurchase,
        ?AllparfumeVariant $allparfumeVariant,
        ?int $sellerOneSupplierId,
        ?int $mainWarehouseId = null,
        ?array $preloadedOffers = null,
    ): array {
        $empty = [
            'role' => 'ordinary',
            'input_price' => null,
            'proposed_site_price' => null,
            'sellable_price' => null,
            'apply' => false,
            'manual' => null,
            'allparfume' => null,
            'warehouse' => null,
        ];

        $offers = $this->qualifyingAllparfumeOffers($allparfumeVariant, $preloadedOffers);
        if ($offers !== []) {
            return $this->decideAllparfume(
                $variant,
                $warehousePurchase,
                $supplierListingMinPurchase,
                $allparfumeVariant,
                $offers,
                $sellerOneSupplierId,
                $mainWarehouseId,
            );
        }

        if ($warehousePurchase !== null && $warehousePurchase > 0) {
            return $this->decideWarehouse(
                $variant,
                $warehousePurchase,
                $supplierListingMinPurchase,
                $mainWarehouseId,
            );
        }

        // Fallback: ordinary formula from listing min only.
        $input = $supplierListingMinPurchase !== null && $supplierListingMinPurchase > 0
            ? $supplierListingMinPurchase
            : null;
        if ($input === null) {
            return $empty;
        }

        $retail = $this->sellerOnePricing->calculateRetailPrice(
            $input,
            $variant,
            $sellerOneSupplierId,
        );

        return [
            ...$empty,
            'input_price' => MoneyDecimal::normalize($input),
            'proposed_site_price' => MoneyDecimal::normalize($retail),
            'apply' => true,
            'warehouse' => [
                'warehouse_purchase' => null,
                'supplier_purchase' => MoneyDecimal::normalize($input),
                'formula_input' => MoneyDecimal::normalize($input),
                'path' => 'listing_only',
            ],
        ];
    }

    /**
     * @param  list<AllparfumeShopOffer>|null  $preloaded
     * @return list<AllparfumeShopOffer>
     */
    private function qualifyingAllparfumeOffers(?AllparfumeVariant $variant, ?array $preloaded): array
    {
        if ($preloaded !== null) {
            $list = $preloaded;
        } elseif ($variant instanceof AllparfumeVariant) {
            $list = $variant->relationLoaded('shopOffers')
                ? $variant->shopOffers->all()
                : AllparfumeShopOffer::query()
                    ->where('allparfume_variant_id', $variant->id)
                    ->where('is_active', true)
                    ->where('include_in_pricing', true)
                    ->where('price', '>', 0)
                    ->orderBy('price')
                    ->orderBy('shop_name')
                    ->get()
                    ->all();
        } else {
            return [];
        }

        $filtered = [];
        foreach ($list as $offer) {
            if (! $offer instanceof AllparfumeShopOffer) {
                continue;
            }
            if (! $offer->is_active || ! $offer->include_in_pricing) {
                continue;
            }
            if ((float) $offer->price <= 0) {
                continue;
            }
            $filtered[] = $offer;
        }

        usort(
            $filtered,
            static function (AllparfumeShopOffer $a, AllparfumeShopOffer $b): int {
                $cmp = ((float) $a->price) <=> ((float) $b->price);
                if ($cmp !== 0) {
                    return $cmp;
                }

                return strcmp((string) $a->shop_name, (string) $b->shop_name);
            },
        );

        return $filtered;
    }

    /**
     * @param  list<AllparfumeShopOffer>  $offers
     * @return Decision
     */
    private function decideAllparfume(
        ProductVariantLink $variant,
        ?float $warehousePurchase,
        ?float $supplierListingMinPurchase,
        ?AllparfumeVariant $allparfumeVariant,
        array $offers,
        ?int $sellerOneSupplierId,
        ?int $mainWarehouseId,
    ): array {
        $candidates = array_values(array_filter(
            [$warehousePurchase, $supplierListingMinPurchase],
            static fn (?float $v): bool => $v !== null && $v > 0,
        ));
        $input = $candidates === [] ? null : min($candidates);

        $offerRows = [];
        foreach ($offers as $index => $offer) {
            $offerRows[] = [
                'shop_key' => (string) $offer->shop_key,
                'shop_name' => (string) $offer->shop_name,
                'price' => MoneyDecimal::normalize($offer->price),
                'role' => $index === 0 ? 'min' : ($index === 1 ? 'next' : null),
                'selected' => false,
                'include_in_pricing' => (bool) $offer->include_in_pricing,
            ];
        }

        $base = [
            'role' => 'allparfume',
            'input_price' => $input !== null ? MoneyDecimal::normalize($input) : null,
            'proposed_site_price' => null,
            'sellable_price' => null,
            'apply' => false,
            'manual' => null,
            'allparfume' => [
                'allparfume_variant_id' => (int) ($allparfumeVariant?->id ?? 0),
                'selected_offer_role' => null,
                'selected_purchase' => null,
                'selected_shop_name' => null,
                'offers' => $offerRows,
            ],
            'warehouse' => null,
        ];

        if ($input === null) {
            $base['manual'] = [
                'reason' => WarehouseManualPriceReview::REASON_ALLPARFUME_NO_INPUT,
                'manual_retail_price' => null,
                'list_on_storefront' => false,
            ];

            return $base;
        }

        $baseRetail = $this->resolveRetail($variant, $input, $sellerOneSupplierId, $mainWarehouseId, $warehousePurchase);
        $sellable = MoneyDecimal::percentOff(MoneyDecimal::normalize($baseRetail), 13.0);
        $base['sellable_price'] = $sellable;

        $sortedPrices = array_map(
            static fn (AllparfumeShopOffer $offer): string => MoneyDecimal::normalize($offer->price),
            $offers,
        );
        $snap = AllparfumeOfferSnap::select($sellable, $sortedPrices);

        if ($snap === null) {
            $base['manual'] = [
                'reason' => WarehouseManualPriceReview::REASON_ALLPARFUME_NO_MATCH,
                'manual_retail_price' => $sellable,
                'list_on_storefront' => false,
            ];
            $base['proposed_site_price'] = $sellable;

            return $base;
        }

        $selectedIndex = $snap['index'];
        $site = $snap['price'];
        $base['allparfume']['offers'][$selectedIndex]['selected'] = true;
        $base['allparfume']['selected_offer_role'] = $snap['role'];
        $base['allparfume']['selected_purchase'] = $site;
        $base['allparfume']['selected_shop_name'] = (string) $offers[$selectedIndex]->shop_name;
        $base['proposed_site_price'] = $site;
        $base['apply'] = true;

        return $base;
    }

    /**
     * @return Decision
     */
    private function decideWarehouse(
        ProductVariantLink $variant,
        float $warehousePurchase,
        ?float $supplierOfferPurchase,
        ?int $mainWarehouseId,
    ): array {
        $w = MoneyDecimal::normalize($warehousePurchase);
        $base = [
            'role' => 'ordinary',
            'input_price' => $w,
            'proposed_site_price' => null,
            'sellable_price' => null,
            'apply' => false,
            'manual' => null,
            'allparfume' => null,
            'warehouse' => [
                'warehouse_purchase' => $w,
                'supplier_purchase' => null,
                'formula_input' => null,
                'path' => 'warehouse',
            ],
        ];

        if ($supplierOfferPurchase === null || $supplierOfferPurchase <= 0) {
            $base['manual'] = [
                'reason' => WarehouseManualPriceReview::REASON_NO_SUPPLIER_MATCH,
                'manual_retail_price' => null,
                'list_on_storefront' => false,
            ];
            $base['warehouse']['path'] = 'no_supplier';

            return $base;
        }

        $o = MoneyDecimal::normalize($supplierOfferPurchase);
        $base['warehouse']['supplier_purchase'] = $o;
        $diffPct = MoneyDecimal::percentDiffAbs($w, $o, $o);

        // Warehouse <= offer: blend (w + 2o)/3
        if (MoneyDecimal::isLessOrEqual($w, $o)) {
            $formulaInput = MoneyDecimal::warehouseOfferBlend($w, $o);
            $base['warehouse']['formula_input'] = $formulaInput;
            $base['input_price'] = $formulaInput;
            $retail = $this->formulaResolver->calculateRetailPrice(
                $variant,
                (float) $formulaInput,
                PriceFormula::SOURCE_WAREHOUSE,
                $mainWarehouseId ?? $this->purchasePriceResolver->resolveMainWarehouseId(),
            );
            if ($retail === null) {
                $retail = $this->sellerOnePricing->calculateRetailPrice((float) $formulaInput, $variant, null);
            }
            $proposed = MoneyDecimal::normalize($retail);
            $base['proposed_site_price'] = $proposed;
            $base['warehouse']['path'] = 'blend';

            if ($diffPct > 30.0) {
                $base['manual'] = [
                    'reason' => WarehouseManualPriceReview::REASON_WAREHOUSE_BLEND_GAP,
                    'manual_retail_price' => $proposed,
                    'list_on_storefront' => false,
                ];
                $base['apply'] = false;

                return $base;
            }

            $base['apply'] = true;

            return $base;
        }

        // Warehouse > offer
        if ($diffPct > 10.0) {
            $proposed = MoneyDecimal::percentOff($w, 10.0);
            $base['proposed_site_price'] = $proposed;
            $base['warehouse']['formula_input'] = $w;
            $base['warehouse']['path'] = 'warehouse_minus_10';
            $base['manual'] = [
                'reason' => WarehouseManualPriceReview::REASON_WAREHOUSE_OFFER_GAP,
                'manual_retail_price' => $proposed,
                'list_on_storefront' => false,
            ];

            return $base;
        }

        // Diff <= 10%: formula from offer purchase
        $base['input_price'] = $o;
        $base['warehouse']['formula_input'] = $o;
        $base['warehouse']['path'] = 'offer_formula';
        $retail = $this->sellerOnePricing->calculateRetailPrice((float) $o, $variant, null);
        if ($mainWarehouseId !== null && $mainWarehouseId > 0) {
            $resolved = $this->formulaResolver->calculateRetailPrice(
                $variant,
                (float) $o,
                PriceFormula::SOURCE_WAREHOUSE,
                $mainWarehouseId,
            );
            if ($resolved !== null) {
                $retail = $resolved;
            }
        }
        $base['proposed_site_price'] = MoneyDecimal::normalize($retail);
        $base['apply'] = true;

        return $base;
    }

    private function resolveRetail(
        ProductVariantLink $variant,
        float $input,
        ?int $sellerOneSupplierId,
        ?int $mainWarehouseId,
        ?float $warehousePurchase,
    ): float {
        if ($warehousePurchase !== null && $warehousePurchase > 0 && $mainWarehouseId !== null && $mainWarehouseId > 0) {
            $resolved = $this->formulaResolver->calculateRetailPrice(
                $variant,
                $input,
                PriceFormula::SOURCE_WAREHOUSE,
                $mainWarehouseId,
            );
            if ($resolved !== null) {
                return $resolved;
            }
        }

        return $this->sellerOnePricing->calculateRetailPrice($input, $variant, $sellerOneSupplierId);
    }
}
