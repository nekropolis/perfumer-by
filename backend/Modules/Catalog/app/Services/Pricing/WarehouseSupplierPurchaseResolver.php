<?php

namespace Modules\Catalog\Services\Pricing;

use Illuminate\Support\Collection;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierVariantOffer;

final class WarehouseSupplierPurchaseResolver
{
    private const string DEFAULT_PRICING_SUPPLIER_CODE = 'edp';

    /**
     * @param  array<int, array{
     *     warehouse_purchase: string,
     *     supplier_sku: ?string,
     *     receipt_supplier_id: ?int,
     *     receipt_supplier_code: ?string,
     *     stock_receipt_id: int,
     *     received_at: ?string
     * }>  $receiptMetaByVariant
     * @return array<int, array{
     *     supplier_id: int,
     *     supplier_purchase: string,
     *     external_code: ?string
     * }|null>
     */
    public function resolveForVariants(array $receiptMetaByVariant): array
    {
        if ($receiptMetaByVariant === []) {
            return [];
        }

        $variantIds = array_keys($receiptMetaByVariant);
        $pricingSupplierIds = Supplier::query()
            ->forPricing()
            ->where('is_active', true)
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        if ($pricingSupplierIds === []) {
            return array_fill_keys($variantIds, null);
        }

        $offers = SupplierVariantOffer::query()
            ->whereIn('product_variant_id', $variantIds)
            ->whereIn('supplier_id', $pricingSupplierIds)
            ->where('is_active', true)
            ->get(['id', 'supplier_id', 'product_variant_id', 'external_id', 'sku', 'purchase_price', 'payload']);

        /** @var Collection<int, Collection<int, SupplierVariantOffer>> */
        $offersByVariant = $offers->groupBy(static fn (SupplierVariantOffer $o): int => (int) $o->product_variant_id);

        $defaultSupplierId = (int) (Supplier::query()
            ->forPricing()
            ->where('code', self::DEFAULT_PRICING_SUPPLIER_CODE)
            ->value('id') ?? 0);

        $result = [];
        foreach ($receiptMetaByVariant as $variantId => $receiptMeta) {
            $variantOffers = $offersByVariant->get((int) $variantId, collect());
            $result[(int) $variantId] = $this->pickOffer(
                $variantOffers,
                $receiptMeta,
                $defaultSupplierId,
            );
        }

        return $result;
    }

    /**
     * @param  Collection<int, SupplierVariantOffer>  $offers
     * @param  array{
     *     warehouse_purchase: string,
     *     supplier_sku: ?string,
     *     receipt_supplier_id: ?int,
     *     receipt_supplier_code: ?string,
     *     stock_receipt_id: int,
     *     received_at: ?string
     * }  $receiptMeta
     * @return array{supplier_id: int, supplier_purchase: string, external_code: ?string}|null
     */
    private function pickOffer(Collection $offers, array $receiptMeta, int $defaultSupplierId): ?array
    {
        if ($offers->isEmpty()) {
            return null;
        }

        $receiptSupplierId = (int) ($receiptMeta['receipt_supplier_id'] ?? 0);
        $supplierSku = trim((string) ($receiptMeta['supplier_sku'] ?? ''));

        $candidates = $offers->values();

        if ($receiptSupplierId > 0) {
            $byReceiptSupplier = $candidates->where('supplier_id', $receiptSupplierId);
            if ($supplierSku !== '') {
                $byCode = $byReceiptSupplier->first(
                    static fn (SupplierVariantOffer $o): bool => self::offerMatchesCode($o, $supplierSku),
                );
                if ($byCode instanceof SupplierVariantOffer) {
                    return self::offerToPurchase($byCode);
                }
            }

            $byVariantLink = $byReceiptSupplier->first();
            if ($byVariantLink instanceof SupplierVariantOffer) {
                return self::offerToPurchase($byVariantLink);
            }
        }

        if ($defaultSupplierId > 0) {
            $defaultOffers = $candidates->where('supplier_id', $defaultSupplierId);
            if ($supplierSku !== '') {
                $byCode = $defaultOffers->first(
                    static fn (SupplierVariantOffer $o): bool => self::offerMatchesCode($o, $supplierSku),
                );
                if ($byCode instanceof SupplierVariantOffer) {
                    return self::offerToPurchase($byCode);
                }
            }

            $byVariantLink = $defaultOffers->first();
            if ($byVariantLink instanceof SupplierVariantOffer) {
                return self::offerToPurchase($byVariantLink);
            }
        }

        $fallback = $candidates->first();
        if ($fallback instanceof SupplierVariantOffer) {
            return self::offerToPurchase($fallback);
        }

        return null;
    }

    private static function offerMatchesCode(SupplierVariantOffer $offer, string $code): bool
    {
        $externalId = trim((string) ($offer->external_id ?? ''));
        $sku = trim((string) ($offer->sku ?? ''));

        return ($externalId !== '' && strcasecmp($externalId, $code) === 0)
            || ($sku !== '' && strcasecmp($sku, $code) === 0);
    }

    /**
     * @return array{supplier_id: int, supplier_purchase: string, external_code: ?string}|null
     */
    private static function offerToPurchase(SupplierVariantOffer $offer): ?array
    {
        $payload = is_array($offer->payload) ? $offer->payload : [];
        $raw = $payload['supplier_price'] ?? $offer->purchase_price;
        if ($raw === null || !is_numeric((string) $raw) || (float) $raw <= 0) {
            return null;
        }

        $externalCode = trim((string) ($offer->external_id ?? ''));
        if ($externalCode === '') {
            $externalCode = trim((string) ($offer->sku ?? ''));
        }

        return [
            'supplier_id' => (int) $offer->supplier_id,
            'supplier_purchase' => number_format((float) $raw, 2, '.', ''),
            'external_code' => $externalCode !== '' ? $externalCode : null,
        ];
    }
}
