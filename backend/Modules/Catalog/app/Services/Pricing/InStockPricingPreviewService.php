<?php

namespace Modules\Catalog\Services\Pricing;

use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogSearchScoring;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Models\AllparfumeVariant;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePricingService;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;

final class InStockPricingPreviewService
{
    public function __construct(
        private readonly WarehousePurchasePriceResolver $purchasePriceResolver,
        private readonly SellerOnePricingService $sellerOnePricing,
        private readonly SellerOneVariantMatcher $variantMatcher,
        private readonly VariantRetailPriceDecisionService $priceDecision,
    ) {
    }

    /**
     * @return LengthAwarePaginator<int, array<string, mixed>>
     */
    public function paginate(
        int $page = 1,
        int $perPage = 50,
        ?string $search = null,
        ?string $role = null,
    ): LengthAwarePaginator {
        $perPage = in_array($perPage, [25, 50, 100], true) ? $perPage : 50;
        $role = in_array($role, ['ordinary', 'allparfume'], true) ? $role : null;

        $query = ProductVariantLink::query()
            ->with(['product.brand', 'definition', 'supplierOffers'])
            ->tap(static fn ($q) => CatalogVariantStockPresenter::applyStorefrontInStockScope($q));

        $searchTerm = $search !== null ? trim((string) preg_replace('/\s+/u', ' ', $search)) : '';

        if ($searchTerm !== '') {
            $like = '%'.CatalogSearchScoring::escapeLikeValue($searchTerm).'%';
            $compact = CatalogSearchScoring::compactSearchText($searchTerm);
            $compactLike = $compact !== ''
                ? '%'.CatalogSearchScoring::escapeLikeValue($compact).'%'
                : null;
            $brandNameSub = '(SELECT `name` FROM `brands` WHERE `brands`.`id` = `products`.`brand_id` LIMIT 1)';
            $displayExpr = "LOWER(TRIM(CONCAT(COALESCE({$brandNameSub}, ''), ' ', COALESCE(`products`.`name`, ''))))";
            $compactExpr = "REPLACE(REPLACE(LOWER(CONCAT(COALESCE({$brandNameSub}, ''), COALESCE(`products`.`name`, ''))), '-', ''), ' ', '')";
            $query->where(function ($q) use ($searchTerm, $like, $compactLike, $displayExpr, $compactExpr): void {
                if (ctype_digit($searchTerm)) {
                    $q->where('id', (int) $searchTerm);
                }
                $q->orWhereHas('product', static function ($pq) use ($like, $compactLike, $displayExpr, $compactExpr): void {
                    $pq->where('name', 'like', $like)
                        ->orWhere('slug', 'like', $like)
                        ->orWhereHas('brand', static function ($bq) use ($like): void {
                            $bq->where('name', 'like', $like);
                        })
                        ->orWhereRaw("{$displayExpr} LIKE LOWER(?)", [$like]);
                    if ($compactLike !== null) {
                        $pq->orWhereRaw("{$compactExpr} LIKE ?", [$compactLike]);
                    }
                });
            });
        }

        if ($role === 'allparfume') {
            $query->whereExists(function ($q): void {
                $q->selectRaw('1')
                    ->from('allparfume_variants as av')
                    ->join('allparfume_shop_offers as ao', 'ao.allparfume_variant_id', '=', 'av.id')
                    ->whereColumn('av.product_variant_link_id', 'product_variant_links.id')
                    ->where('ao.is_active', true)
                    ->where('ao.include_in_pricing', true)
                    ->where('ao.price', '>', 0);
            });
        } elseif ($role === 'ordinary') {
            $query->whereNotExists(function ($q): void {
                $q->selectRaw('1')
                    ->from('allparfume_variants as av')
                    ->join('allparfume_shop_offers as ao', 'ao.allparfume_variant_id', '=', 'av.id')
                    ->whereColumn('av.product_variant_link_id', 'product_variant_links.id')
                    ->where('ao.is_active', true)
                    ->where('ao.include_in_pricing', true)
                    ->where('ao.price', '>', 0);
            });
        }

        if ($searchTerm !== '') {
            $ranked = (clone $query)
                ->get()
                ->sort(function (ProductVariantLink $a, ProductVariantLink $b) use ($searchTerm): int {
                    $ra = CatalogSearchScoring::productSearchRank(
                        $searchTerm,
                        (string) ($a->product?->brand?->name ?? ''),
                        (string) ($a->product?->name ?? ''),
                    );
                    $rb = CatalogSearchScoring::productSearchRank(
                        $searchTerm,
                        (string) ($b->product?->brand?->name ?? ''),
                        (string) ($b->product?->name ?? ''),
                    );
                    $cmp = CatalogSearchScoring::compareProductSearchRanks($ra, $rb);
                    if ($cmp !== 0) {
                        return $cmp;
                    }

                    return ((int) $b->id) <=> ((int) $a->id);
                })
                ->values();

            $total = $ranked->count();
            $page = max(1, $page);
            $lastPage = max(1, (int) ceil($total / $perPage));
            if ($page > $lastPage) {
                $page = $lastPage;
            }
            $pageItems = $ranked->forPage($page, $perPage)->values();
            $paginator = new LengthAwarePaginator(
                $pageItems,
                $total,
                $perPage,
                $page,
                ['path' => Paginator::resolveCurrentPath()],
            );
        } else {
            $query->orderByDesc('id');
            Paginator::currentPageResolver(static fn (): int => max(1, $page));
            $paginator = $query->paginate($perPage);
            assert($paginator instanceof LengthAwarePaginator);
        }

        $variantIds = collect($paginator->items())
            ->map(static fn (ProductVariantLink $v): int => (int) $v->id)
            ->all();

        $mainWarehouseId = $this->purchasePriceResolver->resolveMainWarehouseId();
        $warehouseReceiptMeta = $mainWarehouseId > 0
            ? $this->purchasePriceResolver->lastPostedReceiptMetaForMainWarehouse($variantIds, $mainWarehouseId)
            : [];

        $allparfumeByLinkId = AllparfumeVariant::query()
            ->with(['shopOffers' => static function ($q): void {
                $q->where('is_active', true)
                    ->where('include_in_pricing', true)
                    ->orderBy('price')
                    ->orderBy('shop_name');
            }])
            ->whereIn('product_variant_link_id', $variantIds)
            ->get()
            ->keyBy('product_variant_link_id');

        $sellerOneSupplierId = (int) (Supplier::query()
            ->where('code', \Modules\ImportExport\Services\Vanille\Support\SupplierPriceProfile::CODE_EDP)
            ->value('id') ?? 0);

        $productIds = collect($paginator->items())
            ->map(static fn (ProductVariantLink $v): int => (int) $v->product_id)
            ->unique()
            ->values()
            ->all();

        $offersByVariantId = SupplierVariantOffer::query()
            ->with(['supplier:id,name,code'])
            ->whereIn('product_variant_id', $variantIds)
            ->where('is_active', true)
            ->get()
            ->groupBy(static fn (SupplierVariantOffer $o): int => (int) $o->product_variant_id);

        $linkedSupplierProducts = SupplierProduct::query()
            ->whereIn('product_id', $productIds)
            ->where('is_linked', true)
            ->where('is_active', true)
            ->where('link_parsing_active', true)
            ->get(['product_id', 'supplier_id', 'external_name']);

        /** @var array<string, string> $externalNameByProductSupplier */
        $externalNameByProductSupplier = [];
        foreach ($linkedSupplierProducts as $sp) {
            $key = ((int) $sp->product_id).':'.((int) $sp->supplier_id);
            $name = trim((string) ($sp->external_name ?? ''));
            if ($name !== '') {
                $externalNameByProductSupplier[$key] = $name;
            }
        }

        /** @var array<int, true> $linkedProductSupplierKeys */
        $linkedProductSupplierKeys = [];
        foreach ($linkedSupplierProducts as $sp) {
            $linkedProductSupplierKeys[((int) $sp->product_id).':'.((int) $sp->supplier_id)] = true;
        }

        $receiptSupplierIds = collect($warehouseReceiptMeta)
            ->pluck('receipt_supplier_id')
            ->filter(static fn ($id): bool => $id !== null && (int) $id > 0)
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        $receiptSupplierNames = $receiptSupplierIds === []
            ? []
            : Supplier::query()
                ->whereIn('id', $receiptSupplierIds)
                ->pluck('name', 'id')
                ->all();

        $rows = collect($paginator->items())->map(
            function (ProductVariantLink $variant) use (
                $warehouseReceiptMeta,
                $allparfumeByLinkId,
                $sellerOneSupplierId,
                $offersByVariantId,
                $externalNameByProductSupplier,
                $linkedProductSupplierKeys,
                $receiptSupplierNames,
            ): array {
                $variantId = (int) $variant->id;
                $productId = (int) $variant->product_id;
                $offers = $offersByVariantId->get($variantId, collect());

                return $this->serializeRow(
                    $variant,
                    $warehouseReceiptMeta[$variantId] ?? null,
                    $allparfumeByLinkId->get($variantId),
                    $sellerOneSupplierId > 0 ? $sellerOneSupplierId : null,
                    $offers,
                    $externalNameByProductSupplier,
                    $linkedProductSupplierKeys,
                    $receiptSupplierNames,
                    $productId,
                );
            }
        );

        $paginator->setCollection($rows);

        return $paginator;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, SupplierVariantOffer>  $offers
     * @param  array<string, string>  $externalNameByProductSupplier
     * @param  array<string, true>  $linkedProductSupplierKeys
     * @param  array<int, string>  $receiptSupplierNames
     * @param  array{
     *     warehouse_purchase: string,
     *     supplier_sku: ?string,
     *     receipt_supplier_id: ?int,
     *     receipt_supplier_code: ?string,
     *     stock_receipt_id: int,
     *     received_at: ?string
     * }|null  $warehouseMeta
     * @return array<string, mixed>
     */
    private function serializeRow(
        ProductVariantLink $variant,
        ?array $warehouseMeta,
        ?AllparfumeVariant $allparfumeVariant,
        ?int $sellerOneSupplierId,
        $offers,
        array $externalNameByProductSupplier,
        array $linkedProductSupplierKeys,
        array $receiptSupplierNames,
        int $productId,
    ): array {
        $product = $variant->product;
        $displayName = $product ? ProductDisplayName::forProduct($product) : (string) ($product?->name ?? '');
        $variantLabel = $this->variantMatcher->buildVariantLabel($variant);

        $inputSources = [];

        if ($warehouseMeta !== null) {
            $warehousePurchase = (float) $warehouseMeta['warehouse_purchase'];
            if ($warehousePurchase > 0) {
                $receiptSupplierId = $warehouseMeta['receipt_supplier_id'] !== null
                    ? (int) $warehouseMeta['receipt_supplier_id']
                    : null;
                $receiptSupplierName = $receiptSupplierId !== null
                    ? trim((string) ($receiptSupplierNames[$receiptSupplierId] ?? ''))
                    : '';
                $receiptCode = trim((string) ($warehouseMeta['receipt_supplier_code'] ?? ''));
                $sourceLabel = 'Склад';
                if ($receiptSupplierName !== '') {
                    $sourceLabel .= ' · '.$receiptSupplierName;
                } elseif ($receiptCode !== '') {
                    $sourceLabel .= ' · '.$receiptCode;
                }

                $sku = trim((string) ($warehouseMeta['supplier_sku'] ?? ''));
                $nameParts = [];
                if ($receiptSupplierId !== null) {
                    $ext = $externalNameByProductSupplier[$productId.':'.$receiptSupplierId] ?? null;
                    if ($ext !== null && $ext !== '') {
                        $nameParts[] = $ext;
                    }
                }
                if ($sku !== '' && !in_array($sku, $nameParts, true)) {
                    $nameParts[] = $sku;
                }

                $inputSources[] = [
                    'source' => 'warehouse',
                    'source_label' => $sourceLabel,
                    'product_name' => $nameParts !== [] ? implode(' · ', $nameParts) : null,
                    'price' => number_format($warehousePurchase, 2, '.', ''),
                    'selected' => false,
                ];
            }
        }

        foreach ($offers as $offer) {
            $payload = is_array($offer->payload) ? $offer->payload : [];
            if (CatalogVariantStockPresenter::supplierOfferPayloadBlocksListing($payload)) {
                continue;
            }

            $supplierId = (int) $offer->supplier_id;
            $linkKey = $productId.':'.$supplierId;
            if (!isset($linkedProductSupplierKeys[$linkKey])) {
                continue;
            }

            $raw = $payload['supplier_price'] ?? $offer->purchase_price;
            if ($raw === null || !is_numeric((string) $raw)) {
                continue;
            }
            $purchase = (float) $raw;
            if ($purchase <= 0) {
                continue;
            }

            $supplierName = trim((string) ($offer->supplier?->name ?? ''));
            if ($supplierName === '') {
                $supplierName = 'Поставщик #'.$supplierId;
            }

            // Имя/SKU с оффера варианта: у product+supplier несколько SKU, product-level map схлопывает их.
            $extProduct = trim((string) ($offer->external_product_name ?? ''));
            $extVariant = trim((string) ($offer->external_variant_name ?? ''));
            $sku = trim((string) ($offer->sku ?? ''));
            if ($sku === '') {
                $sku = trim((string) ($offer->external_id ?? ''));
            }
            if ($sku === '') {
                $sku = trim((string) ($payload['external_code'] ?? ''));
            }

            $nameParts = [];
            if ($extProduct !== '') {
                $nameParts[] = $extProduct;
            } elseif ($extVariant !== '') {
                $nameParts[] = $extVariant;
            }
            if ($sku !== '' && ! in_array($sku, $nameParts, true)) {
                $nameParts[] = $sku;
            }

            $inputSources[] = [
                'source' => 'supplier',
                'source_label' => $supplierName,
                'product_name' => $nameParts !== [] ? implode(' · ', $nameParts) : null,
                'price' => number_format($purchase, 2, '.', ''),
                'selected' => false,
            ];
        }

        usort(
            $inputSources,
            static fn (array $a, array $b): int => ((float) $a['price']) <=> ((float) $b['price']),
        );

        $inputPrice = null;
        if ($inputSources !== []) {
            $minPriceStr = (string) $inputSources[0]['price'];
            $inputPrice = (float) $minPriceStr;
            foreach ($inputSources as $i => $src) {
                if ((string) $src['price'] === $minPriceStr) {
                    $inputSources[$i]['selected'] = true;
                }
            }
        }

        $warehousePurchase = null;
        foreach ($inputSources as $src) {
            if (($src['source'] ?? '') === 'warehouse') {
                $warehousePurchase = (float) $src['price'];
                break;
            }
        }
        $supplierMin = null;
        foreach ($inputSources as $src) {
            if (($src['source'] ?? '') === 'supplier') {
                $p = (float) $src['price'];
                $supplierMin = $supplierMin === null ? $p : min($supplierMin, $p);
            }
        }

        $mainWarehouseId = $this->purchasePriceResolver->resolveMainWarehouseId();
        $decision = $this->priceDecision->decide(
            $variant,
            $warehousePurchase,
            $supplierMin,
            $allparfumeVariant instanceof AllparfumeVariant ? $allparfumeVariant : null,
            $sellerOneSupplierId,
            $mainWarehouseId > 0 ? $mainWarehouseId : null,
        );

        $ordinaryProposed = null;
        if ($inputPrice !== null) {
            $ordinaryProposed = $this->sellerOnePricing->calculateRetailPrice(
                $inputPrice,
                $variant,
                $sellerOneSupplierId,
            );
        }

        $allparfumePayload = null;
        if (is_array($decision['allparfume'] ?? null)) {
            $allparfumePayload = [
                ...$decision['allparfume'],
                'min_price' => $allparfumeVariant?->min_price !== null
                    ? number_format((float) $allparfumeVariant->min_price, 2, '.', '')
                    : null,
                'sellable_price' => $decision['sellable_price'] ?? null,
                'manual_reason' => $decision['manual']['reason'] ?? null,
            ];
        }

        return [
            'variant_id' => $variant->id,
            'product_id' => $variant->product_id,
            'product_slug' => $product?->slug,
            'product_name' => $displayName,
            'variant_label' => $variantLabel !== '' ? $variantLabel : ($variant->title ?? '—'),
            'input_price' => $decision['input_price'] ?? ($inputPrice !== null ? number_format($inputPrice, 2, '.', '') : null),
            'input_sources' => $inputSources,
            'role' => $decision['role'] ?? 'ordinary',
            'site_price' => $variant->price !== null ? number_format((float) $variant->price, 2, '.', '') : null,
            'proposed_site_price' => $decision['proposed_site_price'] ?? null,
            'ordinary_proposed_site_price' => $ordinaryProposed !== null
                ? number_format((float) $ordinaryProposed, 2, '.', '')
                : null,
            'manual' => $decision['manual'] ?? null,
            'sellable_price' => $decision['sellable_price'] ?? null,
            'allparfume' => $allparfumePayload,
        ];
    }
}
