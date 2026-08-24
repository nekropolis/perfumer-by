<?php

namespace Modules\Warehouse\Services;

use Illuminate\Support\Collection;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\SellerOneSetting;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Services\Pricing\WarehousePurchasePriceResolver;
use Modules\Catalog\Support\MoneyDecimal;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Warehouse\Models\WarehouseVariantStock;
use Modules\Warehouse\Services\StockLotService;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class WholesalePriceService
{
    public const SETTING_LAST_CALCULATED_AT = 'warehouse.wholesale_last_calculated_at';

    private const CHUNK_SIZE = 200;

    private const OFFER_MULTIPLIER = 1.12;

    private const OFFER_ADDEND = 3.5;

    public function __construct(
        private readonly WarehousePurchasePriceResolver $purchasePriceResolver,
        private readonly StockLotService $stockLotService,
    ) {
    }

    public function lastCalculatedAt(): ?string
    {
        $value = trim((string) (SellerOneSetting::query()
            ->where('key', self::SETTING_LAST_CALCULATED_AT)
            ->value('value') ?? ''));

        return $value !== '' ? $value : null;
    }

    /**
     * Источник, из которого считается опт: мин. закупка активного офера, иначе вход основного склада.
     *
     * @param  list<int>  $variantIds
     * @return array<int, array{source: string, purchase_price: string, supplier_name: string|null, name: string|null}>
     */
    public function sourcesForVariants(array $variantIds): array
    {
        $variantIds = array_values(array_unique(array_filter(
            array_map(static fn ($id): int => (int) $id, $variantIds),
            static fn (int $id): bool => $id > 0,
        )));
        if ($variantIds === []) {
            return [];
        }

        $offerDetails = $this->minOfferDetailsByVariant($variantIds);
        $needEntry = array_values(array_diff($variantIds, array_keys($offerDetails)));
        $entryByVariant = [];
        if ($needEntry !== []) {
            $mainWarehouseId = $this->purchasePriceResolver->resolveMainWarehouseId();
            $entryByVariant = $mainWarehouseId > 0
                ? $this->entryPurchaseByVariant($needEntry, $mainWarehouseId)
                : [];
        }

        $map = [];
        foreach ($variantIds as $variantId) {
            if (isset($offerDetails[$variantId])) {
                $details = $offerDetails[$variantId];
                $map[$variantId] = [
                    'source' => 'offer',
                    'purchase_price' => MoneyDecimal::normalize($details['purchase']),
                    'supplier_name' => $details['supplier_name'],
                    'name' => $details['name'],
                ];
                continue;
            }

            $entry = $entryByVariant[$variantId] ?? null;
            if ($entry !== null && $entry > 0) {
                $map[$variantId] = [
                    'source' => 'entry',
                    'purchase_price' => MoneyDecimal::normalize($entry),
                    'supplier_name' => null,
                    'name' => null,
                ];
            }
        }

        return $map;
    }

    /**
     * @return array{updated: int, skipped: int, last_calculated_at: string}
     */
    public function recalculate(): array
    {
        $variantIds = WarehouseVariantStock::query()
            ->where('stock', '>', 0)
            ->whereNotNull('variant_id')
            ->distinct()
            ->pluck('variant_id')
            ->map(static fn ($id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->values()
            ->all();

        $updated = 0;
        $skipped = 0;
        $mainWarehouseId = $this->purchasePriceResolver->resolveMainWarehouseId();

        foreach (array_chunk($variantIds, self::CHUNK_SIZE) as $chunkIds) {
            $offerPurchaseByVariant = $this->minOfferPurchaseByVariant($chunkIds);
            $entryByVariant = $mainWarehouseId > 0
                ? $this->entryPurchaseByVariant($chunkIds, $mainWarehouseId)
                : [];

            $variants = ProductVariantLink::query()
                ->whereIn('id', $chunkIds)
                ->get(['id', 'wholesale_price']);

            foreach ($variants as $variant) {
                $variantId = (int) $variant->id;
                $offerPurchase = $offerPurchaseByVariant[$variantId] ?? null;
                $entryPurchase = $entryByVariant[$variantId] ?? null;

                $wholesale = $this->calculateWholesale($offerPurchase, $entryPurchase);
                if ($wholesale === null) {
                    if ($variant->wholesale_price !== null) {
                        $variant->wholesale_price = null;
                        $variant->save();
                        $updated++;
                    } else {
                        $skipped++;
                    }
                    continue;
                }

                $normalized = MoneyDecimal::normalize($wholesale);
                if (
                    $variant->wholesale_price !== null
                    && MoneyDecimal::compare(MoneyDecimal::normalize($variant->wholesale_price), $normalized) === 0
                ) {
                    $skipped++;
                    continue;
                }

                $variant->wholesale_price = $normalized;
                $variant->save();
                $updated++;
            }
        }

        $calculatedAt = now()->toDateTimeString();
        SellerOneSetting::query()->updateOrCreate(
            ['key' => self::SETTING_LAST_CALCULATED_AT],
            ['value' => $calculatedAt],
        );

        return [
            'updated' => $updated,
            'skipped' => $skipped,
            'last_calculated_at' => $calculatedAt,
        ];
    }

    public function exportXlsx(): StreamedResponse
    {
        $this->recalculate();

        $rows = $this->exportRows();
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Прайс опт');

        $rowNum = 1;
        $maxTitleLen = 12;
        foreach ($rows as $row) {
            $sheet->setCellValue("A{$rowNum}", $row['part_number']);
            $sheet->setCellValue("B{$rowNum}", $row['title']);
            $sheet->setCellValueExplicit(
                "C{$rowNum}",
                (float) $row['wholesale_price'],
                DataType::TYPE_NUMERIC,
            );
            $maxTitleLen = max($maxTitleLen, mb_strlen($row['title'], 'UTF-8'));
            $rowNum++;
        }

        $sheet->getColumnDimension('A')->setAutoSize(true);
        // AutoSize часто занижает кириллицу — ширину названия считаем по длине строки.
        $sheet->getColumnDimension('B')->setWidth(min(80, max(20, $maxTitleLen + 2)));
        $sheet->getColumnDimension('C')->setAutoSize(true);

        $filename = 'wholesale-price-'.now()->format('Y-m-d-His').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet): void {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * @return list<array{part_number: int, title: string, wholesale_price: string}>
     */
    private function exportRows(): array
    {
        $variantIds = WarehouseVariantStock::query()
            ->where('stock', '>', 0)
            ->whereNotNull('variant_id')
            ->distinct()
            ->pluck('variant_id')
            ->map(static fn ($id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->values()
            ->all();

        if ($variantIds === []) {
            return [];
        }

        $variants = ProductVariantLink::query()
            ->with(['product.brand', 'definition'])
            ->whereIn('id', $variantIds)
            ->whereNotNull('wholesale_price')
            ->get();

        $sorted = $variants->sortBy(static function (ProductVariantLink $variant): string {
            $brand = mb_strtolower(trim((string) ($variant->product?->brand?->name ?? '')), 'UTF-8');
            $product = mb_strtolower(trim((string) ($variant->product?->name ?? '')), 'UTF-8');
            $title = mb_strtolower(trim((string) $variant->title), 'UTF-8');

            return $brand.'|'.$product.'|'.$title;
        })->values();

        $rows = [];
        foreach ($sorted as $variant) {
            $display = ProductDisplayName::format(
                $variant->product?->brand?->name,
                (string) ($variant->product?->name ?? ''),
            );
            $variantTitle = trim((string) $variant->title);
            $title = $variantTitle !== ''
                ? trim($display.' '.$variantTitle)
                : $display;

            if ($title === '') {
                continue;
            }

            $rows[] = [
                'part_number' => (int) $variant->id,
                'title' => $title,
                'wholesale_price' => MoneyDecimal::normalize($variant->wholesale_price),
            ];
        }

        return $rows;
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, float>
     */
    private function entryPurchaseByVariant(array $variantIds, int $mainWarehouseId): array
    {
        $avgMap = $this->stockLotService->avgPurchaseByVariant($variantIds, $mainWarehouseId);
        if (count($avgMap) === count($variantIds)) {
            $map = [];
            foreach ($avgMap as $variantId => $price) {
                $map[$variantId] = (float) $price;
            }

            return $map;
        }

        $fallback = $this->purchasePriceResolver->lastPostedPricesForMainWarehouse($variantIds, $mainWarehouseId);
        $map = [];
        foreach ($variantIds as $variantId) {
            if (isset($avgMap[$variantId])) {
                $map[$variantId] = (float) $avgMap[$variantId];
            } elseif (isset($fallback[$variantId])) {
                $map[$variantId] = $fallback[$variantId];
            }
        }

        return $map;
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, float>
     */
    private function minOfferPurchaseByVariant(array $variantIds): array
    {
        $map = [];
        foreach ($this->minOfferDetailsByVariant($variantIds) as $variantId => $details) {
            $map[$variantId] = $details['purchase'];
        }

        return $map;
    }

    /**
     * @param  list<int>  $variantIds
     * @return array<int, array{purchase: float, supplier_name: string|null, name: string|null}>
     */
    private function minOfferDetailsByVariant(array $variantIds): array
    {
        if ($variantIds === []) {
            return [];
        }

        /** @var Collection<int, SupplierVariantOffer> $offers */
        $offers = SupplierVariantOffer::query()
            ->with(['supplier:id,name'])
            ->whereIn('product_variant_id', $variantIds)
            ->where('is_active', true)
            ->get(['id', 'product_variant_id', 'supplier_id', 'external_product_name', 'purchase_price', 'payload']);

        $map = [];
        foreach ($offers as $offer) {
            $variantId = (int) $offer->product_variant_id;
            $payload = is_array($offer->payload) ? $offer->payload : [];
            $purchase = $this->resolveOfferPurchasePrice($offer, $payload);
            if ($purchase === null || $purchase <= 0) {
                continue;
            }

            if (isset($map[$variantId]) && $map[$variantId]['purchase'] <= $purchase) {
                continue;
            }

            $name = trim((string) ($offer->external_product_name ?? ''));
            $supplierName = trim((string) ($offer->supplier?->name ?? ''));

            $map[$variantId] = [
                'purchase' => $purchase,
                'supplier_name' => $supplierName !== '' ? $supplierName : null,
                'name' => $name !== '' ? $name : null,
            ];
        }

        return $map;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function resolveOfferPurchasePrice(SupplierVariantOffer $offer, array $payload): ?float
    {
        $raw = $payload['supplier_price'] ?? $offer->purchase_price;
        if ($raw === null || !is_numeric((string) $raw)) {
            return null;
        }

        return (float) $raw;
    }

    private function calculateWholesale(?float $offerPurchase, ?float $entryPurchase): ?float
    {
        $purchase = null;
        if ($offerPurchase !== null && $offerPurchase > 0) {
            $purchase = $offerPurchase;
        } elseif ($entryPurchase !== null && $entryPurchase > 0) {
            $purchase = $entryPurchase;
        }

        if ($purchase === null) {
            return null;
        }

        return round($purchase * self::OFFER_MULTIPLIER + self::OFFER_ADDEND, 2);
    }
}
