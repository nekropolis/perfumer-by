<?php

namespace Modules\Catalog\Services\Pricing;

use Modules\Catalog\Models\PriceFormula;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\WarehouseManualPriceReview;
use Modules\Catalog\Services\ListingMinPriceService;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Models\AllparfumeVariant;
use Modules\Warehouse\Models\WarehouseVariantStock;

final class WarehousePriceRefreshService
{
    private const CHUNK_SIZE = 200;

    public function __construct(
        private readonly PriceFormulaResolver $formulaResolver,
        private readonly WarehousePurchasePriceResolver $purchasePriceResolver,
        private readonly WarehouseSupplierPurchaseResolver $supplierPurchaseResolver,
        private readonly WarehouseManualPriceReviewSyncService $manualReviewSync,
        private readonly ListingMinPriceService $listingMinPriceService,
        private readonly VariantRetailPriceDecisionService $priceDecision,
    ) {
    }

    /**
     * @param  callable(array<string, mixed>): void|null  $onProgress
     * @return array<string, int>
     */
    public function refresh(?int $priceRefreshRunId = null, ?callable $onProgress = null): array
    {
        $mainWarehouseId = $this->purchasePriceResolver->resolveMainWarehouseId();
        if ($mainWarehouseId <= 0) {
            return $this->emptyStats();
        }

        $stats = $this->emptyStats();
        /** @var array<int, true> */
        $touchedProductIds = [];
        /** @var list<int> */
        $manualQueuedVariantIds = [];

        $warehouseTotal = (int) WarehouseVariantStock::query()
            ->where('warehouse_id', $mainWarehouseId)
            ->where('stock', '>', 0)
            ->count();

        if ($onProgress !== null) {
            $onProgress($this->progressPayload(
                phase: 'warehouse',
                processed: 0,
                total: $warehouseTotal,
                message: $warehouseTotal > 0
                    ? "Склад: 0 / {$warehouseTotal}"
                    : 'Склад: нет позиций для обработки',
            ));
        }

        WarehouseVariantStock::query()
            ->where('warehouse_id', $mainWarehouseId)
            ->where('stock', '>', 0)
            ->orderBy('id')
            ->chunkById(self::CHUNK_SIZE, function ($rows) use (
                $mainWarehouseId,
                $priceRefreshRunId,
                &$stats,
                &$touchedProductIds,
                &$manualQueuedVariantIds,
                $onProgress,
                $warehouseTotal,
            ): void {
                $variantIds = $rows->pluck('variant_id')
                    ->map(static fn ($id): int => (int) $id)
                    ->filter(static fn (int $id): bool => $id > 0)
                    ->values()
                    ->all();

                if ($variantIds === []) {
                    return;
                }

                $receiptMetaMap = $this->purchasePriceResolver->lastPostedReceiptMetaForMainWarehouse(
                    $variantIds,
                    $mainWarehouseId,
                );
                $supplierPurchaseMap = $this->supplierPurchaseResolver->resolveForVariants($receiptMetaMap);

                $variants = ProductVariantLink::query()
                    ->with(['definition', 'product', 'supplierOffers'])
                    ->whereIn('id', $variantIds)
                    ->get()
                    ->keyBy('id');

                $allparfumeLinkIds = AllparfumeVariant::query()
                    ->whereIn('product_variant_link_id', $variantIds)
                    ->whereHas('shopOffers', static function ($q): void {
                        $q->where('is_active', true)
                            ->where('include_in_pricing', true)
                            ->where('price', '>', 0);
                    })
                    ->pluck('product_variant_link_id')
                    ->map(static fn ($id): int => (int) $id)
                    ->all();
                $allparfumeSkip = array_fill_keys($allparfumeLinkIds, true);

                foreach ($variantIds as $variantId) {
                    $stats['processed']++;
                    $variant = $variants->get($variantId);
                    if (!$variant) {
                        continue;
                    }

                    // Allparfume branch handles these in a dedicated phase / decision path.
                    if (isset($allparfumeSkip[$variantId])) {
                        continue;
                    }

                    $receiptMeta = $receiptMetaMap[$variantId] ?? null;
                    if ($receiptMeta === null) {
                        $stats['no_purchase_price']++;

                        continue;
                    }

                    if ($this->formulaResolver->shouldSkipVariantPrice(
                        $variant,
                        PriceFormula::SOURCE_WAREHOUSE,
                        $mainWarehouseId,
                    )) {
                        $stats['skipped_by_rule']++;

                        continue;
                    }

                    $warehousePurchase = (float) $receiptMeta['warehouse_purchase'];
                    $listingMin = CatalogVariantStockPresenter::minListingPurchasePrice($variant);
                    $matchedSupplier = $supplierPurchaseMap[$variantId] ?? null;

                    $decision = $this->priceDecision->decide(
                        $variant,
                        $warehousePurchase,
                        $listingMin,
                        null,
                        null,
                        $mainWarehouseId,
                    );

                    if (($decision['manual'] ?? null) !== null) {
                        if ($priceRefreshRunId !== null) {
                            $receiptSupplierId = $receiptMeta['receipt_supplier_id'];
                            if ($receiptSupplierId !== null && $receiptSupplierId > 0) {
                                $supplierValid = Supplier::query()->forPricing()->whereKey($receiptSupplierId)->exists();
                                if (!$supplierValid) {
                                    $receiptSupplierId = null;
                                }
                            }

                            $this->manualReviewSync->queue($priceRefreshRunId, [
                                'variant_id' => $variantId,
                                'product_id' => (int) $variant->product_id,
                                'product_name' => $variant->product
                                    ? ProductDisplayName::forProduct($variant->product)
                                    : (string) $variant->title,
                                'variant_title' => (string) $variant->title,
                                'reason' => (string) $decision['manual']['reason'],
                                'warehouse_purchase' => $receiptMeta['warehouse_purchase'],
                                'supplier_purchase' => $decision['warehouse']['supplier_purchase']
                                    ?? ($matchedSupplier['supplier_purchase'] ?? null),
                                'receipt_supplier_id' => $receiptSupplierId,
                                'supplier_sku' => $receiptMeta['supplier_sku'],
                                'supplier_external_code' => $matchedSupplier['external_code'] ?? null,
                                'manual_retail_price' => $decision['manual']['manual_retail_price'] ?? null,
                                'list_on_storefront' => (bool) ($decision['manual']['list_on_storefront'] ?? false),
                            ]);
                            $manualQueuedVariantIds[] = $variantId;
                            $stats['manual_queued']++;
                        }

                        continue;
                    }

                    if (!($decision['apply'] ?? false) || $decision['proposed_site_price'] === null) {
                        $stats['skipped_by_rule']++;

                        continue;
                    }

                    $this->manualReviewSync->resolveByVariantId($variantId);

                    $retail = (float) $decision['proposed_site_price'];
                    $stats['blended_updated']++;
                    if ($this->applyRetailPrice($variant, $retail)) {
                        $stats['updated']++;
                    } else {
                        $stats['unchanged']++;
                    }

                    if ($variant->product_id) {
                        $touchedProductIds[(int) $variant->product_id] = true;
                    }
                }

                if ($onProgress !== null) {
                    $onProgress($this->progressPayload(
                        phase: 'warehouse',
                        processed: $stats['processed'],
                        total: $warehouseTotal,
                        message: 'Склад: ' . $stats['processed'] . ' / ' . $warehouseTotal,
                        extra: [
                            'warehouse_processed' => $stats['processed'],
                            'warehouse_updated' => $stats['updated'],
                            'warehouse_manual_queued' => $stats['manual_queued'],
                        ],
                    ));
                }
            });

        if ($priceRefreshRunId !== null) {
            $stats['manual_resolved'] = $this->manualReviewSync->resolveExcept($manualQueuedVariantIds);
        }

        foreach (array_keys($touchedProductIds) as $productId) {
            $this->listingMinPriceService->syncForProduct((int) $productId);
        }

        return $stats;
    }

    /**
     * @return array<string, int>
     */
    private function emptyStats(): array
    {
        return [
            'processed' => 0,
            'updated' => 0,
            'unchanged' => 0,
            'skipped_by_rule' => 0,
            'no_purchase_price' => 0,
            'blended_updated' => 0,
            'manual_queued' => 0,
            'manual_resolved' => 0,
        ];
    }

    private function applyRetailPrice(ProductVariantLink $variant, float $retail): bool
    {
        $current = $variant->price !== null ? (float) $variant->price : null;
        if ($current !== null && abs($current - $retail) < 0.004) {
            return false;
        }

        $variant->update([
            'price' => $retail,
        ]);

        return true;
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function progressPayload(
        string $phase,
        int $processed,
        int $total,
        string $message,
        array $extra = [],
    ): array {
        $progress = $total > 0
            ? (int) min(100, max(0, round(($processed / $total) * 100)))
            : ($processed > 0 ? 100 : 0);

        return array_merge([
            'phase' => $phase,
            'processed' => $processed,
            'total' => $total,
            'progress' => $progress,
            'message' => $message,
            'status' => 'running',
        ], $extra);
    }
}
