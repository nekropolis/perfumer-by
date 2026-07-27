<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Services\ListingMinPriceService;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Models\AllparfumeVariant;
use Modules\Warehouse\Models\WarehouseVariantStock;

/**
 * Apply allparfume retail decisions during price refresh for in-stock linked variants.
 */
final class AllparfumeRetailPriceApplyService
{
    private const CHUNK_SIZE = 200;

    public function __construct(
        private readonly WarehousePurchasePriceResolver $purchasePriceResolver,
        private readonly VariantRetailPriceDecisionService $priceDecision,
        private readonly WarehouseManualPriceReviewSyncService $manualReviewSync,
        private readonly ListingMinPriceService $listingMinPriceService,
    ) {
    }

    /**
     * @param  callable(array<string, mixed>): void|null  $onProgress
     * @return array<string, int>
     */
    public function apply(?int $priceRefreshRunId = null, ?callable $onProgress = null): array
    {
        $stats = [
            'processed' => 0,
            'updated' => 0,
            'unchanged' => 0,
            'manual_queued' => 0,
            'skipped' => 0,
        ];

        $mainWarehouseId = $this->purchasePriceResolver->resolveMainWarehouseId();
        $sellerOneSupplierId = (int) (Supplier::query()
            ->where('code', 'supplier-price-xls')
            ->value('id') ?? 0);

        $query = AllparfumeVariant::query()
            ->whereNotNull('product_variant_link_id')
            ->whereHas('shopOffers', static function ($q): void {
                $q->where('is_active', true)
                    ->where('include_in_pricing', true)
                    ->where('price', '>', 0);
            })
            ->with(['shopOffers' => static function ($q): void {
                $q->where('is_active', true)
                    ->where('include_in_pricing', true)
                    ->where('price', '>', 0)
                    ->orderBy('price')
                    ->orderBy('shop_name');
            }])
            ->orderBy('id');

        $total = (int) (clone $query)->count();
        if ($onProgress !== null) {
            $onProgress([
                'phase' => 'allparfume',
                'processed' => 0,
                'total' => $total,
                'progress' => 0,
                'message' => $total > 0 ? "Allparfume: 0 / {$total}" : 'Allparfume: нет связанных вариантов',
                'status' => 'running',
            ]);
        }

        /** @var array<int, true> $touchedProductIds */
        $touchedProductIds = [];
        /** @var list<int> $manualQueued */
        $manualQueued = [];

        $query->chunkById(self::CHUNK_SIZE, function ($rows) use (
            &$stats,
            &$touchedProductIds,
            &$manualQueued,
            $mainWarehouseId,
            $sellerOneSupplierId,
            $priceRefreshRunId,
            $onProgress,
            $total,
        ): void {
            $linkIds = $rows->pluck('product_variant_link_id')
                ->map(static fn ($id): int => (int) $id)
                ->filter(static fn (int $id): bool => $id > 0)
                ->values()
                ->all();

            if ($linkIds === []) {
                return;
            }

            $inStockIds = [];
            if ($mainWarehouseId > 0) {
                $inStockIds = WarehouseVariantStock::query()
                    ->where('warehouse_id', $mainWarehouseId)
                    ->whereIn('variant_id', $linkIds)
                    ->where('stock', '>', 0)
                    ->pluck('variant_id')
                    ->map(static fn ($id): int => (int) $id)
                    ->all();
            }
            // Also allow storefront in-stock via listing scope ids — keep warehouse stock as primary gate.
            $inStockSet = array_fill_keys($inStockIds, true);

            $receiptMeta = $mainWarehouseId > 0
                ? $this->purchasePriceResolver->lastPostedReceiptMetaForMainWarehouse($linkIds, $mainWarehouseId)
                : [];

            $variants = ProductVariantLink::query()
                ->with(['product', 'definition', 'supplierOffers'])
                ->whereIn('id', $linkIds)
                ->get()
                ->keyBy('id');

            foreach ($rows as $apVariant) {
                $stats['processed']++;
                $linkId = (int) $apVariant->product_variant_link_id;
                if (!isset($inStockSet[$linkId])) {
                    $stats['skipped']++;
                    continue;
                }

                $variant = $variants->get($linkId);
                if (!$variant instanceof ProductVariantLink) {
                    $stats['skipped']++;
                    continue;
                }

                $warehousePurchase = isset($receiptMeta[$linkId])
                    ? (float) $receiptMeta[$linkId]['warehouse_purchase']
                    : null;
                $listingMin = CatalogVariantStockPresenter::minListingPurchasePrice($variant);

                $decision = $this->priceDecision->decide(
                    $variant,
                    $warehousePurchase,
                    $listingMin,
                    $apVariant,
                    $sellerOneSupplierId > 0 ? $sellerOneSupplierId : null,
                    $mainWarehouseId > 0 ? $mainWarehouseId : null,
                );

                if (($decision['manual'] ?? null) !== null && $priceRefreshRunId !== null) {
                    $meta = $receiptMeta[$linkId] ?? null;
                    $this->manualReviewSync->queue($priceRefreshRunId, [
                        'variant_id' => $linkId,
                        'product_id' => (int) $variant->product_id,
                        'product_name' => $variant->product
                            ? ProductDisplayName::forProduct($variant->product)
                            : (string) $variant->title,
                        'variant_title' => (string) $variant->title,
                        'reason' => (string) $decision['manual']['reason'],
                        'warehouse_purchase' => $meta['warehouse_purchase']
                            ?? ($warehousePurchase !== null ? MoneyDecimal::normalize($warehousePurchase) : '0.00'),
                        'supplier_purchase' => $decision['input_price'],
                        'receipt_supplier_id' => $meta['receipt_supplier_id'] ?? null,
                        'supplier_sku' => $meta['supplier_sku'] ?? null,
                        'supplier_external_code' => null,
                        'manual_retail_price' => $decision['manual']['manual_retail_price'] ?? null,
                        'list_on_storefront' => (bool) ($decision['manual']['list_on_storefront'] ?? false),
                    ]);
                    $manualQueued[] = $linkId;
                    $stats['manual_queued']++;
                    continue;
                }

                if (!($decision['apply'] ?? false) || $decision['proposed_site_price'] === null) {
                    $stats['skipped']++;
                    continue;
                }

                $this->manualReviewSync->resolveByVariantId($linkId);
                $retail = (float) $decision['proposed_site_price'];
                $current = $variant->price !== null ? (float) $variant->price : null;
                if ($current !== null && abs($current - $retail) < 0.004) {
                    $stats['unchanged']++;
                } else {
                    $variant->update(['price' => $retail]);
                    $stats['updated']++;
                }
                if ($variant->product_id) {
                    $touchedProductIds[(int) $variant->product_id] = true;
                }
            }

            if ($onProgress !== null) {
                $processed = $stats['processed'];
                $progress = $total > 0 ? (int) min(100, max(0, round(($processed / $total) * 100))) : 0;
                $onProgress([
                    'phase' => 'allparfume',
                    'processed' => $processed,
                    'total' => $total,
                    'progress' => $progress,
                    'message' => "Allparfume: {$processed} / {$total}",
                    'status' => 'running',
                ]);
            }
        });

        foreach (array_keys($touchedProductIds) as $productId) {
            $this->listingMinPriceService->syncForProduct((int) $productId);
        }

        return $stats;
    }
}
