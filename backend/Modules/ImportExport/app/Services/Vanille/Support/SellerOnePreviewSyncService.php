<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Warehouse\Services\StockInventoryService;

class SellerOnePreviewSyncService
{
    public function __construct(
        private readonly StockInventoryService $stockInventory,
    ) {
    }

    /**
     * @param  SupplierProduct|null  $preloadedExisting  строка, предзагруженная батчем
     *         (whereIn по external_url) — экономит SELECT на каждую строку прайса.
     *         null допустим и для новых строк: тогда выполняется одиночный запрос
     *         (защита от дубля кода внутри одного батча).
     * @param  SupplierProduct|null  $resolvedSupplierProduct  сохранённая строка после автосвязки
     */
    public function upsertPreviewRow(
        Supplier $supplier,
        array $parsed,
        callable $autoConfirmCallback,
        ?SupplierProduct $preloadedExisting = null,
        ?SupplierProduct &$resolvedSupplierProduct = null,
    ): string {
        $externalCode = (string) ($parsed['code'] ?? '');
        $externalName = (string) ($parsed['title'] ?? '');
        $externalUrl = "supplier-xls://{$externalCode}";

        $existing = $preloadedExisting ?? SupplierProduct::query()
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
            'price_file_in_stock' => true,
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
            $resolvedSupplierProduct = $existing;

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
        $resolvedSupplierProduct = $created;

        return 'inserted';
    }

    public function touchLinkedSupplierRow(SupplierProduct $supplierProduct, array $row): void
    {
        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];

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
                'price_file_in_stock' => true,
                'last_parsed_at' => now()?->toDateTimeString(),
            ],
        ]);
    }

    /**
     * Batch-version для стриммингового парсинга: обновляет только уже существующие связанные строки.
     *
     * @param  list<array{id:int, external_url:string, is_linked:bool, external_name:string, payload:array}>  $linkedRecords
     * @param  list<array{code?:string, title?:string, supplier_price?:float|null}>  $rows
     */
    public function touchLinkedSupplierRowsBatchFromRecords(int $supplierId, array $linkedRecords, array $rows): int
    {
        if ($linkedRecords === []) {
            return 0;
        }

        $nowStr = now()->toDateTimeString();
        $table = (new SupplierProduct)->getTable();
        $updates = [];
        foreach ($linkedRecords as $idx => $rec) {
            $row = $rows[$idx] ?? [];
            $payload = $rec['payload'] ?? [];
            $title = (string) ($row['title'] ?? ($rec['external_name'] ?? ''));
            $updates[] = [
                'id' => (int) $rec['id'],
                'external_name' => $title,
                'external_slug' => Str::slug($title),
                'payload' => json_encode([
                    ...$payload,
                    'source' => 'seller-one-xls',
                    'external_code' => (string) ($row['code'] ?? ''),
                    'supplier_price' => $row['supplier_price'] ?? null,
                    'min_price' => $row['supplier_price'] ?? null,
                    'price_file_in_stock' => true,
                    'last_parsed_at' => $nowStr,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ];
        }

        $bindings = [];
        $caseUpdate = static function (string $column) use ($updates, &$bindings): string {
            $cases = [];
            foreach ($updates as $update) {
                $cases[] = 'WHEN ? THEN ?';
                $bindings[] = $update['id'];
                $bindings[] = $update[$column];
            }

            return "{$column} = CASE id ".implode(' ', $cases)." ELSE {$column} END";
        };
        $ids = array_column($updates, 'id');
        $sql = "UPDATE {$table} SET "
            .$caseUpdate('external_name').', '
            .$caseUpdate('external_slug').', '
            .$caseUpdate('payload').', '
            .'last_seen_at = ?, updated_at = ? '
            .'WHERE supplier_id = ? AND id IN ('.implode(', ', array_fill(0, count($ids), '?')).')';
        $bindings[] = $nowStr;
        $bindings[] = $nowStr;
        $bindings[] = $supplierId;
        array_push($bindings, ...$ids);

        DB::update($sql, $bindings);
        return count($linkedRecords);
    }

    /**
     * Код в файле прайса: снимаем блокировки витрины и включаем канал поставщика.
     * Снятие с витрины — только когда кода нет в файле (missing_in_latest_price).
     *
     * @param  (callable(int): void)|null  $deferStockFlagsForProduct Если задан — не дергать складской пересчёт
     *        сразу, а сообщить затронутый product_id (для пакета «Обновить цены» на тысячах строк это сильно быстрее).
     */
    public function applyPriceFilePresenceToOffers(
        int $supplierId,
        string $externalCode,
        ?bool $inStockFromColumn,
        ?callable $deferStockFlagsForProduct = null,
    ): void {
        $offers = SupplierVariantOffer::query()
            ->where('supplier_id', $supplierId)
            ->where('external_id', $externalCode)
            ->get(['id', 'payload', 'product_variant_id']);

        // Preload ProductVariantLink для всех variant_id батча
        $variantIds = $offers->pluck('product_variant_id')
            ->filter()
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
        $variantLinksById = $variantIds !== []
            ? ProductVariantLink::query()->whereIn('id', $variantIds)->pluck('product_id', 'id')
            : collect([]);

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
            if ($variantId > 0 && $variantLinksById->has($variantId)) {
                $productId = (int) $variantLinksById[$variantId];
                if ($deferStockFlagsForProduct !== null) {
                    if ($productId > 0) {
                        $deferStockFlagsForProduct($productId);
                    }
                } else {
                    $this->stockInventory->syncProductStockFlagsByProductId($productId);
                }
            }
        }
    }

    /**
     * Строки прайса, которых нет в последнем файле: помечаем в payload оффера и снимаем {@see SupplierVariantOffer::$is_active},
     * чтобы админка и учёт не считали привязку «активной»; связь supplier_products / код в payload сохраняются.
     *
     * Важно: в queue worker каждый Eloquent saved → bump catalog version + синхронный warmup facets.
     * Поэтому обновляем quietly и один раз инвалидируем кеш в конце.
     */
    public function markMissingSupplierCodesAsPreorder(Supplier $supplier, array $codesInLatestPrice): int
    {
        $normalized = [];
        foreach ($codesInLatestPrice as $code) {
            $c = trim((string) $code);
            if ($c !== '') {
                $normalized[$c] = true;
            }
        }

        $flagged = 0;
        /** @var list<int> $variantIds */
        $variantIds = [];
        $markedAt = now()->toDateTimeString();

        app(CatalogApiCacheService::class)->withoutDeferredInvalidation(function () use (
            $supplier,
            $normalized,
            $markedAt,
            &$flagged,
            &$variantIds,
        ): void {
            SupplierVariantOffer::query()
                ->where('supplier_id', $supplier->id)
                ->where('is_active', true)
                ->orderBy('id')
                ->chunkById(200, function ($chunk) use ($normalized, $markedAt, &$flagged, &$variantIds): void {
                    foreach ($chunk as $offer) {
                        /** @var SupplierVariantOffer $offer */
                        $externalId = trim((string) ($offer->external_id ?? ''));
                        if ($externalId !== '' && isset($normalized[$externalId])) {
                            continue;
                        }

                        $payload = is_array($offer->payload) ? $offer->payload : [];
                        if (! empty($payload['missing_in_latest_price']) && $offer->is_active === false) {
                            continue;
                        }

                        $offer->forceFill([
                            'is_active' => false,
                            'payload' => [
                                ...$payload,
                                'missing_in_latest_price' => true,
                                'missing_marked_at' => $markedAt,
                            ],
                        ])->saveQuietly();

                        $flagged++;
                        $variantId = (int) ($offer->product_variant_id ?? 0);
                        if ($variantId > 0) {
                            $variantIds[] = $variantId;
                        }
                    }
                });
        });

        $variantIds = array_values(array_unique($variantIds));
        if ($variantIds !== []) {
            $this->stockInventory->clearSupplierWarehouseShelfForVariantIds($variantIds);
        }

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
                        $needsRestore = !empty($payload['absent_from_parse_table_at'])
                            || ($payload['price_file_in_stock'] ?? null) !== true;
                        if ($needsRestore) {
                            unset($payload['absent_from_parse_table_at']);
                            $payload['price_file_in_stock'] = true;
                            $supplierProduct->forceFill(['payload' => $payload])->saveQuietly();
                        }

                        continue;
                    }

                    if (empty($payload['absent_from_parse_table_at'])) {
                        $supplierProduct->forceFill([
                            'payload' => [
                                ...$payload,
                                'absent_from_parse_table_at' => now()->toDateTimeString(),
                                'price_file_in_stock' => false,
                            ],
                        ])->saveQuietly();
                        $flagged++;
                    }
                }
            });

        return $flagged;
    }

    /**
     * Связанные строки, которых нет в последнем файле: «нет в наличии» (остаются в таблице).
     *
     * @param  list<string>  $codesInLatestPrice
     */
    public function markLinkedMissingFromPriceFile(Supplier $supplier, array $codesInLatestPrice): int
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
            ->where('is_linked', true)
            ->where('link_parsing_active', true)
            ->orderBy('id')
            ->chunkById(400, function ($chunk) use ($normalized, &$flagged): void {
                foreach ($chunk as $supplierProduct) {
                    /** @var SupplierProduct $supplierProduct */
                    $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
                    $externalCode = trim((string) ($payload['external_code'] ?? str_replace('supplier-xls://', '', (string) $supplierProduct->external_url)));
                    if ($externalCode === '' || isset($normalized[$externalCode])) {
                        continue;
                    }

                    if (($payload['price_file_in_stock'] ?? null) === false) {
                        continue;
                    }

                    $supplierProduct->forceFill([
                        'payload' => [
                            ...$payload,
                            'price_file_in_stock' => false,
                        ],
                    ])->saveQuietly();
                    $flagged++;
                }
            });

        return $flagged;
    }
}
