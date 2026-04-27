<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Warehouse\Services\StockInventoryService;

class SellerOnePreviewSyncService
{
    public function __construct(
        private readonly StockInventoryService $stockInventory,
    ) {
    }

    public function upsertPreviewRow(Supplier $supplier, array $parsed, callable $autoConfirmCallback): string
    {
        $externalCode = (string) ($parsed['code'] ?? '');
        $externalName = (string) ($parsed['title'] ?? '');
        $externalUrl = "supplier-xls://{$externalCode}";

        $existing = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('external_url', $externalUrl)
            ->first();

        $existingPayload = $existing && is_array($existing->payload) ? $existing->payload : [];
        $isNew = $existing ? (bool) ($existingPayload['is_new'] ?? false) : true;

        // Confidence/breakdown одинаковы у suggested_variant и suggested_product — кладём общий,
        // но берём из того, что заполнено (продукт может быть без варианта).
        $matchConfidence = (int) (
            $parsed['suggested_variant']['confidence']
            ?? $parsed['suggested_product']['confidence']
            ?? 0
        );
        $matchBreakdown = $parsed['suggested_variant']['confidence_breakdown']
            ?? $parsed['suggested_product']['confidence_breakdown']
            ?? null;

        $nextPayload = [
            ...$existingPayload,
            'source' => 'seller-one-xls',
            'external_code' => $externalCode,
            'supplier_price' => $parsed['supplier_price'] ?? null,
            'min_price' => $parsed['supplier_price'] ?? null,
            'price_file_in_stock' => $parsed['in_stock'] ?? null,
            'parsed' => $parsed['parsed'] ?? [],
            'suggested_variant_id' => $parsed['suggested_variant']['id'] ?? null,
            'suggested_product_id' => $parsed['suggested_product']['id'] ?? null,
            'match_confidence' => $matchConfidence,
            'match_confidence_breakdown' => $matchBreakdown,
            'is_new' => $isNew,
            'last_parsed_at' => now()?->toDateTimeString(),
        ];
        unset($nextPayload['absent_from_parse_table_at']);

        if ($existing) {
            $existing->update([
                'external_name' => $externalName,
                'external_slug' => Str::slug($externalName),
                'brand_id' => $existing->brand_id ?? null,
                'is_active' => true,
                'last_seen_at' => now(),
                'payload' => $nextPayload,
            ]);

            $autoConfirmCallback($existing, $parsed);
            return 'updated';
        }

        $created = SupplierProduct::query()->create([
            'supplier_id' => $supplier->id,
            'brand_id' => null,
            'product_id' => null,
            'external_name' => $externalName,
            'external_slug' => Str::slug($externalName),
            'external_url' => $externalUrl,
            'is_linked' => false,
            'is_active' => true,
            'last_seen_at' => now(),
            'payload' => $nextPayload,
        ]);

        $autoConfirmCallback($created, $parsed);
        return 'inserted';
    }

    public function touchLinkedSupplierRow(SupplierProduct $supplierProduct, array $row): void
    {
        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
        $externalCode = trim((string) ($row['code'] ?? ($payload['external_code'] ?? '')));

        $inStock = array_key_exists('in_stock', $row) ? $row['in_stock'] : null;

        $supplierProduct->update([
            'external_name' => (string) ($row['title'] ?? $supplierProduct->external_name),
            'external_slug' => Str::slug((string) ($row['title'] ?? $supplierProduct->external_name)),
            'last_seen_at' => now(),
            'payload' => [
                ...$payload,
                'source' => 'seller-one-xls',
                'external_code' => (string) ($row['code'] ?? ''),
                'supplier_price' => $row['supplier_price'] ?? null,
                'min_price' => $row['supplier_price'] ?? null,
                'price_file_in_stock' => $inStock,
                'last_parsed_at' => now()?->toDateTimeString(),
            ],
        ]);
        // Наличие по прайсу на витрину — только из «Обновить цены», не при парсинге (см. applyPriceFilePresenceToOffers).
    }

    /**
     * Код снова в файле парсинга: снимаем «нет в файле»; колонка «наличие» (если есть) управляет
     * флагом «нет в наличии по прайсу» на оффере.
     */
    public function applyPriceFilePresenceToOffers(int $supplierId, string $externalCode, ?bool $inStockFromColumn): void
    {
        $offers = SupplierVariantOffer::query()
            ->where('supplier_id', $supplierId)
            ->where('external_id', $externalCode)
            ->get(['id', 'payload', 'product_variant_id']);

        foreach ($offers as $offer) {
            $p = is_array($offer->payload) ? $offer->payload : [];
            unset($p['missing_in_latest_price'], $p['missing_marked_at'], $p['seller_one_listing_deferred']);

            if ($inStockFromColumn === true) {
                unset($p['out_of_stock_in_price_file'], $p['out_of_stock_marked_at']);
            } elseif ($inStockFromColumn === false) {
                $p['out_of_stock_in_price_file'] = true;
                $p['out_of_stock_marked_at'] = now()->toDateTimeString();
            }

            $offer->update([
                'is_active' => true,
                'payload' => $p,
            ]);

            $variantId = (int) ($offer->product_variant_id ?? 0);
            if ($variantId > 0) {
                $variant = ProductVariantLink::query()->find($variantId);
                if ($variant) {
                    $this->stockInventory->syncProductStockFlagsByProductId((int) $variant->product_id);
                }
            }
        }
    }

    /**
     * Строки прайса, которых нет в последнем файле: помечаем в payload оффера и снимаем {@see SupplierVariantOffer::$is_active},
     * чтобы админка и учёт не считали привязку «активной»; связь supplier_products / код в payload сохраняются.
     */
    public function markMissingSupplierCodesAsPreorder(Supplier $supplier, array $codesInLatestPrice): int
    {
        $normalizedCodes = array_values(array_filter(array_map(
            static fn (mixed $code): string => trim((string) $code),
            $codesInLatestPrice
        ), static fn (string $code): bool => $code !== ''));

        $offersQuery = SupplierVariantOffer::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_active', true);

        if (!empty($normalizedCodes)) {
            $offersQuery->whereNotIn('external_id', $normalizedCodes);
        }

        $missingOffers = $offersQuery->get(['id', 'product_variant_id', 'payload']);
        if ($missingOffers->isEmpty()) {
            return 0;
        }

        $flagged = 0;

        DB::transaction(function () use ($missingOffers, &$flagged) {
            foreach ($missingOffers as $offer) {
                $payload = is_array($offer->payload) ? $offer->payload : [];
                if (!empty($payload['missing_in_latest_price'])) {
                    continue;
                }
                $offer->update([
                    'is_active' => false,
                    'payload' => [
                        ...$payload,
                        'missing_in_latest_price' => true,
                        'missing_marked_at' => now()?->toDateTimeString(),
                    ],
                ]);
                $flagged++;
            }
        });

        $variantIds = $missingOffers
            ->pluck('product_variant_id')
            ->filter()
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
        $this->stockInventory->clearSupplierWarehouseShelfForVariantIds($variantIds);

        return $flagged;
    }

    /**
     * Не связанные строки, которых нет в последнем файле парсинга: помечаем в payload (скрытие из таблицы),
     * данные не удаляем — при появлении кода снова флаг снимается в {@see upsertPreviewRow()}.
     *
     * @param  list<string>  $codesInLatestPrice
     */
    public function markAbsentUnlinkedForSellerOne(Supplier $supplier, array $codesInLatestPrice): int
    {
        $normalized = [];
        foreach ($codesInLatestPrice as $code) {
            $c = trim((string) $code);
            if ($c !== '') {
                $normalized[$c] = true;
            }
        }

        $flagged = 0;

        SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_linked', false)
            ->where('link_parsing_active', true)
            ->orderBy('id')
            ->chunkById(400, function ($chunk) use ($normalized, &$flagged): void {
                foreach ($chunk as $supplierProduct) {
                    /** @var SupplierProduct $supplierProduct */
                    $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
                    $externalCode = trim((string) ($payload['external_code'] ?? str_replace('supplier-xls://', '', (string) $supplierProduct->external_url)));
                    if ($externalCode === '') {
                        continue;
                    }

                    if (isset($normalized[$externalCode])) {
                        if (!empty($payload['absent_from_parse_table_at'])) {
                            unset($payload['absent_from_parse_table_at']);
                            $supplierProduct->update(['payload' => $payload]);
                        }

                        continue;
                    }

                    if (empty($payload['absent_from_parse_table_at'])) {
                        $supplierProduct->update([
                            'payload' => [
                                ...$payload,
                                'absent_from_parse_table_at' => now()->toDateTimeString(),
                            ],
                        ]);
                        $flagged++;
                    }
                }
            });

        return $flagged;
    }
}
