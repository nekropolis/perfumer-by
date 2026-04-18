<?php

namespace Modules\ImportExport\Services\Vanille;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierPriceHistory;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\SupplierVariantOffer;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Models\VariantDefinition;
use Modules\ImportExport\Services\Vanille\Parsers\SellerOneSpreadsheetParser;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePreviewSyncService;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePricingService;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;

class SupplierPriceImportService
{
    private const DEFAULT_SUPPLIER_CODE = 'supplier-price-xls';
    private const DEFAULT_SUPPLIER_NAME = 'Supplier XLS Price';
    public function __construct(
        private readonly SellerOneVariantMatcher $variantMatcher,
        private readonly SellerOneSpreadsheetParser $spreadsheetParser,
        private readonly SellerOnePricingService $pricingService,
        private readonly SellerOnePreviewSyncService $previewSyncService,
    ) {
    }

    public function getPricingSettings(): array
    {
        return $this->pricingService->getSettings();
    }

    public function updatePricingSettings(array $settings): array
    {
        return $this->pricingService->updateSettings($settings);
    }

    public function preview(UploadedFile $file, int $offset = 0, int $limit = 100): array
    {
        $supplier = $this->getOrCreateSellerOneSupplier();
        $allRows = $this->spreadsheetParser->readRowsFromFile($file);
        $totalRows = count($allRows);
        $offset = max($offset, 0);
        $limit = max($limit, 1);
        $rows = array_slice($allRows, $offset, $limit);
        $isFinalBatch = ($offset + $limit) >= $totalRows;
        $brands = Brand::query()->select(['id', 'name'])->get();
        $productsIndex = $this->buildProductsIndex();
        $externalUrls = array_map(
            static fn (array $row): string => 'supplier-xls://' . (string) ($row['code'] ?? ''),
            $rows
        );
        $existingByUrl = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->whereIn('external_url', $externalUrls)
            ->get()
            ->keyBy('external_url');
        $rules = SellerOneMatchRule::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $matched = 0;
        $inserted = 0;
        $updated = 0;
        $skippedLinked = 0;
        $prepared = [];

        foreach ($rows as $row) {
            $externalCode = (string) ($row['code'] ?? '');
            $externalUrl = "supplier-xls://{$externalCode}";
            /** @var SupplierProduct|null $existing */
            $existing = $existingByUrl->get($externalUrl);

            if ($existing && $existing->is_linked) {
                $this->previewSyncService->touchLinkedSupplierRow($existing, $row);
                $skippedLinked++;
                continue;
            }

            $parsed = $this->parseSupplierRow($row, $brands, $rules, $productsIndex);
            if ($parsed['suggested_variant']) {
                $matched++;
            }

            $upsert = $this->previewSyncService->upsertPreviewRow(
                $supplier,
                $parsed,
                function (SupplierProduct $supplierProduct, array $parsedRow) use ($supplier): void {
                    $this->tryAutoConfirmLink($supplier, $supplierProduct, $parsedRow);
                }
            );
            if ($upsert === 'inserted') {
                $inserted++;
            } else {
                $updated++;
            }

            $prepared[] = $parsed;
        }

        $markedPreorder = 0;
        if ($isFinalBatch) {
            $allCodes = array_map(
                static fn (array $row): string => (string) ($row['code'] ?? ''),
                $allRows
            );
            $markedPreorder = $this->previewSyncService->markMissingSupplierCodesAsPreorder($supplier, $allCodes);
        }

        return [
            'message' => 'Прайс обработан',
            'items' => count($prepared),
            'matched' => $matched,
            'unmatched' => count($prepared) - $matched,
            'inserted' => $inserted,
            'updated' => $updated,
            'skipped_linked' => $skippedLinked,
            'offset' => $offset,
            'limit' => $limit,
            'total_rows' => $totalRows,
            'processed' => count($prepared) + $skippedLinked,
            'marked_preorder' => $markedPreorder,
            'done' => ($offset + $limit) >= $totalRows,
            'next_offset' => min($offset + $limit, $totalRows),
            'rows' => $prepared,
        ];
    }

    /**
     * Полный прогон XLSX-прайса одним джобом с фиксированным использованием памяти:
     *
     *  - XLSX читается ровно один раз (не на каждый батч);
     *  - variantsIndex/brands/rules собираются один раз и шарятся между батчами;
     *  - в конце каждого батча через `$onBatch` пушится прогресс (для кэша джоба);
     *  - батч-локальные массивы unset-ятся и вызывается gc_collect_cycles().
     *
     * Это заменяет прежнюю схему «цикл вокруг preview()», которая переоткрывала
     * PhpSpreadsheet и переподнимала индекс вариантов на каждой итерации и в
     * итоге раздувала воркер до 1.5–2 ГБ RSS.
     *
     * @param  callable(array): void|null  $onBatch  прогресс-колбэк
     * @return array{total_rows:int,processed:int,matched:int,inserted:int,updated:int,skipped_linked:int,marked_preorder:int,message:string}
     */
    public function processAllRowsFromFile(
        string $absolutePath,
        int $batchSize = 200,
        ?callable $onBatch = null,
    ): array {
        $batchSize = max($batchSize, 1);

        $supplier = $this->getOrCreateSellerOneSupplier();

        // XLSX читаем ОДИН раз.
        $allRows = $this->spreadsheetParser->readRowsFromPath($absolutePath);
        $totalRows = count($allRows);

        // Общие кэши на весь прогон.
        $brands = Brand::query()->select(['id', 'name'])->get();
        $productsIndex = $this->buildProductsIndex();
        $rules = SellerOneMatchRule::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $totalMatched = 0;
        $totalInserted = 0;
        $totalUpdated = 0;
        $totalSkippedLinked = 0;
        $totalProcessed = 0;

        for ($offset = 0; $offset < max($totalRows, 1); $offset += $batchSize) {
            if ($offset >= $totalRows) {
                break;
            }

            $rows = array_slice($allRows, $offset, $batchSize);
            $isFinalBatch = ($offset + $batchSize) >= $totalRows;

            $externalUrls = array_map(
                static fn (array $row): string => 'supplier-xls://' . (string) ($row['code'] ?? ''),
                $rows,
            );

            $existingByUrl = SupplierProduct::query()
                ->where('supplier_id', $supplier->id)
                ->whereIn('external_url', $externalUrls)
                ->get()
                ->keyBy('external_url');

            foreach ($rows as $row) {
                $externalCode = (string) ($row['code'] ?? '');
                $externalUrl = "supplier-xls://{$externalCode}";
                /** @var SupplierProduct|null $existing */
                $existing = $existingByUrl->get($externalUrl);

                if ($existing && $existing->is_linked) {
                    $this->previewSyncService->touchLinkedSupplierRow($existing, $row);
                    $totalSkippedLinked++;
                    $totalProcessed++;
                    continue;
                }

                $parsed = $this->parseSupplierRow($row, $brands, $rules, $productsIndex);
                if ($parsed['suggested_variant']) {
                    $totalMatched++;
                }

                $upsert = $this->previewSyncService->upsertPreviewRow(
                    $supplier,
                    $parsed,
                    function (SupplierProduct $supplierProduct, array $parsedRow) use ($supplier): void {
                        $this->tryAutoConfirmLink($supplier, $supplierProduct, $parsedRow);
                    }
                );
                if ($upsert === 'inserted') {
                    $totalInserted++;
                } else {
                    $totalUpdated++;
                }

                $totalProcessed++;
                unset($parsed);
            }

            if ($onBatch) {
                $onBatch([
                    'total_rows' => $totalRows,
                    'processed' => $totalProcessed,
                    'matched' => $totalMatched,
                    'inserted' => $totalInserted,
                    'updated' => $totalUpdated,
                    'skipped_linked' => $totalSkippedLinked,
                    'done' => $isFinalBatch,
                ]);
            }

            unset($rows, $existingByUrl, $externalUrls);
            if (function_exists('gc_collect_cycles')) {
                gc_collect_cycles();
            }
        }

        $markedPreorder = 0;
        if ($totalRows > 0) {
            $allCodes = array_map(
                static fn (array $row): string => (string) ($row['code'] ?? ''),
                $allRows,
            );
            $markedPreorder = $this->previewSyncService->markMissingSupplierCodesAsPreorder(
                $supplier,
                $allCodes,
            );
            unset($allCodes);
        }

        unset($allRows, $brands, $productsIndex, $rules);

        return [
            'message' => 'Прайс обработан',
            'total_rows' => $totalRows,
            'processed' => $totalProcessed,
            'matched' => $totalMatched,
            'inserted' => $totalInserted,
            'updated' => $totalUpdated,
            'skipped_linked' => $totalSkippedLinked,
            'marked_preorder' => $markedPreorder,
        ];
    }

    public function refreshLinkedPrices(UploadedFile $file): array
    {
        $supplier = $this->getOrCreateSellerOneSupplier();
        $rows = $this->spreadsheetParser->readRowsFromFile($file);

        $supplierPriceByCode = [];
        foreach ($rows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            if ($code === '') {
                continue;
            }
            $supplierPriceByCode[$code] = $this->toFloat($row['supplier_price'] ?? ($row['min_price'] ?? null));
        }

        $codesInPrice = array_keys($supplierPriceByCode);
        $linkedProducts = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_linked', true)
            ->get();

        $updated = 0;
        $skipped = 0;
        $missingCodes = [];
        $priceHistoryRows = 0;

        foreach ($linkedProducts as $supplierProduct) {
            $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
            $externalCode = trim((string) ($payload['external_code'] ?? str_replace('supplier-xls://', '', (string) $supplierProduct->external_url)));
            if ($externalCode === '') {
                $skipped++;
                continue;
            }

            if (!array_key_exists($externalCode, $supplierPriceByCode)) {
                $missingCodes[] = $externalCode;
                continue;
            }

            $supplierPrice = $supplierPriceByCode[$externalCode];
            if ($supplierPrice === null) {
                $skipped++;
                continue;
            }

            $variantId = (int) ($payload['linked_variant_id'] ?? 0);
            if ($variantId <= 0) {
                $variantId = (int) (SupplierVariantOffer::query()
                    ->where('supplier_id', $supplier->id)
                    ->where('external_id', $externalCode)
                    ->value('product_variant_id') ?? 0);
            }
            if ($variantId <= 0) {
                $skipped++;
                continue;
            }

            $variant = ProductVariant::query()->with('product')->find($variantId);
            if (!$variant || !$variant->product) {
                $skipped++;
                continue;
            }

            $resolvedPrice = $this->pricingService->calculateRetailPrice($supplierPrice);

            DB::transaction(function () use (
                $supplier,
                $supplierProduct,
                $variant,
                $externalCode,
                $supplierPrice,
                $resolvedPrice,
                &$updated,
                &$priceHistoryRows
            ): void {
                $product = $variant->product;
                $existingPayload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];

                $variant->update([
                    'price' => $resolvedPrice,
                    'stock' => max((int) ($variant->stock ?? 0), 1),
                    'is_preorder' => false,
                    'is_active' => true,
                ]);

                $product->update([
                    'is_out_of_stock' => false,
                ]);

                $supplierProduct->update([
                    'brand_id' => $product->brand_id,
                    'product_id' => $product->id,
                    'is_linked' => true,
                    'is_active' => true,
                    'last_seen_at' => now(),
                    'payload' => [
                        ...$existingPayload,
                        'source' => 'seller-one-xls',
                        'external_code' => $externalCode,
                        'supplier_price' => $supplierPrice,
                        'min_price' => $supplierPrice,
                        'is_new' => false,
                        'linked_variant_id' => $variant->id,
                        'link_type' => $existingPayload['link_type'] ?? 'manual',
                        'last_parsed_at' => now()?->toDateTimeString(),
                    ],
                ]);

                $offer = SupplierVariantOffer::query()->updateOrCreate(
                    [
                        'supplier_id' => $supplier->id,
                        'product_variant_id' => $variant->id,
                        'external_id' => $externalCode,
                    ],
                    [
                        'external_product_url' => $supplierProduct->external_url,
                        'external_product_name' => $supplierProduct->external_name,
                        'external_variant_name' => $this->buildVariantLabel($variant),
                        'sku' => $externalCode,
                        'price' => $resolvedPrice,
                        'purchase_price' => $supplierPrice,
                        'is_preorder' => false,
                        'is_active' => true,
                        'last_seen_at' => now(),
                        'last_synced_at' => now(),
                        'payload' => [
                            'source' => 'seller-one-xls',
                            'external_code' => $externalCode,
                            'supplier_price' => $supplierPrice,
                        ],
                    ]
                );

                SupplierPriceHistory::query()->create([
                    'supplier_variant_offer_id' => $offer->id,
                    'price' => $offer->price,
                    'old_price' => $offer->old_price,
                    'stock' => (int) ($offer->stock ?? 0),
                    'captured_at' => Carbon::now(),
                ]);

                $updated++;
                $priceHistoryRows++;
            });
        }

        $missingCodes = array_values(array_unique($missingCodes));
        $deactivatedOffers = 0;
        $deactivatedVariants = 0;

        if (!empty($missingCodes)) {
            DB::transaction(function () use (
                $supplier,
                $missingCodes,
                &$deactivatedOffers,
                &$deactivatedVariants
            ): void {
                $offers = SupplierVariantOffer::query()
                    ->where('supplier_id', $supplier->id)
                    ->whereIn('external_id', $missingCodes)
                    ->where('is_active', true)
                    ->get();

                $variantIds = [];
                foreach ($offers as $offer) {
                    $offerPayload = is_array($offer->payload) ? $offer->payload : [];
                    $offer->update([
                        'is_active' => false,
                        'is_preorder' => true,
                        'payload' => [
                            ...$offerPayload,
                            'missing_in_latest_price' => true,
                            'missing_marked_at' => now()?->toDateTimeString(),
                        ],
                    ]);

                    if ($offer->product_variant_id) {
                        $variantIds[] = (int) $offer->product_variant_id;
                    }
                    $deactivatedOffers++;
                }

                $variantIds = array_values(array_unique($variantIds));
                if (!empty($variantIds)) {
                    ProductVariant::query()
                        ->whereIn('id', $variantIds)
                        ->update([
                            'is_preorder' => true,
                            'stock' => 0,
                        ]);
                    $deactivatedVariants = count($variantIds);
                }
            });
        }

        return [
            'message' => 'Цены связанных товаров обновлены',
            'updated' => $updated,
            'skipped' => $skipped,
            'price_history_rows' => $priceHistoryRows,
            'missing_codes' => count($missingCodes),
            'deactivated_offers' => $deactivatedOffers,
            'deactivated_variants' => $deactivatedVariants,
            'codes_in_price' => count($codesInPrice),
            'linked_products' => $linkedProducts->count(),
        ];
    }

    public function forceLink(int $supplierProductId, int $variantId): array
    {
        $supplier = $this->getOrCreateSellerOneSupplier();

        $supplierProduct = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->findOrFail($supplierProductId);

        $variant = ProductVariant::query()->with('product')->findOrFail($variantId);
        $product = $variant->product;
        if (!$product) {
            throw new InvalidArgumentException('Не найден продукт для выбранного варианта');
        }

        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
        $externalCode = (string) ($payload['external_code'] ?? '');
        if ($externalCode === '') {
            $externalCode = str_replace('supplier-xls://', '', (string) $supplierProduct->external_url);
        }

        $supplierPrice = $this->toFloat($payload['supplier_price'] ?? ($payload['min_price'] ?? null));

        $this->linkSupplierProductToVariant(
            $supplier,
            $supplierProduct,
            $variant,
            $externalCode,
            $supplierPrice,
            'manual'
        );

        return [
            'message' => "Связка сохранена для supplier_product #{$supplierProduct->id}",
        ];
    }

    public function resetLink(int $supplierProductId): array
    {
        $supplier = $this->getOrCreateSellerOneSupplier();

        $supplierProduct = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->findOrFail($supplierProductId);

        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
        $externalCode = (string) ($payload['external_code'] ?? str_replace('supplier-xls://', '', (string) $supplierProduct->external_url));

        SupplierVariantOffer::query()
            ->where('supplier_id', $supplier->id)
            ->where('external_id', $externalCode)
            ->delete();

        $supplierProduct->update([
            'brand_id' => null,
            'product_id' => null,
            'is_linked' => false,
            'payload' => [
                ...$payload,
                'linked_variant_id' => null,
                'link_type' => null,
            ],
        ]);

        return [
            'message' => "Связка сброшена для supplier_product #{$supplierProduct->id}",
        ];
    }

    public function apply(array $rows): array
    {
        $supplier = Supplier::query()->firstOrCreate(
            ['code' => self::DEFAULT_SUPPLIER_CODE],
            [
                'name' => self::DEFAULT_SUPPLIER_NAME,
                'is_active' => true,
            ]
        );

        $linked = 0;
        $skipped = 0;
        $errors = 0;
        $log = [];

        foreach ($rows as $row) {
            try {
                $variantId = (int) ($row['selected_variant_id'] ?? 0);
                $externalCode = trim((string) ($row['code'] ?? ''));
                $externalName = trim((string) ($row['title'] ?? ''));
                $supplierPrice = $this->toFloat($row['supplier_price'] ?? ($row['min_price'] ?? null));

                if ($variantId <= 0 || $externalCode === '' || $externalName === '') {
                    $skipped++;
                    continue;
                }

                $variant = ProductVariant::query()->with('product')->find($variantId);
                if (!$variant || !$variant->product) {
                    $skipped++;
                    continue;
                }

                DB::transaction(function () use (
                    $supplier,
                    $variant,
                    $externalCode,
                    $externalName,
                    $supplierPrice,
                    &$linked
                ) {
                    $product = $variant->product;
                    $externalUrl = "supplier-xls://{$externalCode}";

                    SupplierProduct::query()->updateOrCreate(
                        [
                            'supplier_id' => $supplier->id,
                            'external_url' => $externalUrl,
                        ],
                        [
                            'brand_id' => $product->brand_id,
                            'product_id' => $product->id,
                            'external_name' => $externalName,
                            'external_slug' => Str::slug($externalName),
                            'is_linked' => true,
                            'is_active' => true,
                            'last_seen_at' => now(),
                            'payload' => [
                                'source' => 'xls',
                                'external_code' => $externalCode,
                            ],
                        ]
                    );

                    $offer = SupplierVariantOffer::query()->updateOrCreate(
                        [
                            'supplier_id' => $supplier->id,
                            'product_variant_id' => $variant->id,
                            'external_id' => $externalCode,
                        ],
                        [
                            'external_product_url' => $externalUrl,
                            'external_product_name' => $externalName,
                            'external_variant_name' => $this->buildVariantLabel($variant),
                            'sku' => $externalCode,
                            'price' => $supplierPrice ?? $variant->price,
                            'purchase_price' => $supplierPrice,
                            'is_active' => true,
                            'last_seen_at' => now(),
                            'last_synced_at' => now(),
                            'payload' => [
                                'source' => 'xls',
                                'external_code' => $externalCode,
                            ],
                        ]
                    );

                    SupplierPriceHistory::query()->create([
                        'supplier_variant_offer_id' => $offer->id,
                        'price' => $offer->price,
                        'old_price' => $offer->old_price,
                        'stock' => (int) ($offer->stock ?? 0),
                        'captured_at' => Carbon::now(),
                    ]);

                    $linked++;
                });

                $log[] = "Связано: {$externalCode} -> variant #{$variantId}";
            } catch (\Throwable $e) {
                $errors++;
                $log[] = "Ошибка строки {$row['code']} : {$e->getMessage()}";
            }
        }

        return [
            'message' => 'Связки сохранены',
            'linked' => $linked,
            'skipped' => $skipped,
            'errors' => $errors,
            'items' => count($rows),
            'log' => $log,
        ];
    }

    private function parseSupplierRow(array $row, $brands, $rules, array $productsIndex): array
    {
        $parsed = $this->variantMatcher->parseSupplierRow($row, $brands, $rules, $productsIndex);

        return $this->tryAutoCreateVariantLink($parsed, $row, $productsIndex);
    }

    /**
     * Если продукт сматчился точно (base = 80, «exact»), но у него нет
     * ProductVariantLink под нужный объём+концентрацию+тестер — пробуем
     * создать такой линк на основе VariantDefinition из справочника.
     *
     * Зачем это нужно:
     *   Раньше в подобных случаях парсер возвращал только `suggested_product`
     *   без варианта — админу приходилось заходить в продукт и вручную
     *   добавлять «100 мл / EDP», чтобы потом прайс с ним связался. Теперь
     *   если definition есть в каталожном справочнике (VariantDefinition),
     *   линк создаётся автоматически, confidence добивается до 100%, и
     *   существующий `tryAutoConfirmLink` (порог 95) привяжет supplier и
     *   через `linkSupplierProductToVariant` проставит retail-цену,
     *   stock=1 и is_active=true.
     *
     * Защиты от мусора:
     *   1) ТОЛЬКО при `name_match_level === 'exact'` (base = 80). На partial
     *      (base = 70) создавать опасно — поставщик мог иметь лишнее слово,
     *      которое на самом деле означает другой продукт.
     *   2) Обязательны оба поля у поставщика: volume И concentration. Без них
     *      нет однозначной definition в справочнике.
     *   3) Обязателен `supplier_price > 0`. Иначе `linkSupplierProductToVariant`
     *      проставит цену 0 и вариант уедет в каталог по нулевой цене.
     *   4) В справочнике должна существовать VariantDefinition ровно под
     *      (volume_ml, concentration_code, is_tester). Иначе пропускаем —
     *      значит, этот размер в каталоге в принципе не предусмотрен.
     *   5) `firstOrCreate` по unique-constraint (product_id, variant_definition_id)
     *      делает операцию идемпотентной: при дубликатах в прайсе создадим
     *      один раз, остальные строки просто возьмут существующий линк.
     *
     * Начальные значения для создаваемого линка: price=0, stock=0,
     * is_active=false. Это безопасно: вариант физически появится в БД,
     * но НЕ будет виден в каталоге до тех пор, пока его не активирует
     * `linkSupplierProductToVariant` (который вызовется из `tryAutoConfirmLink`).
     */
    private function tryAutoCreateVariantLink(array $parsed, array $row, array $productsIndex): array
    {
        $product = $parsed['suggested_product'] ?? null;
        if (!is_array($product) || !empty($parsed['suggested_variant'])) {
            return $parsed;
        }

        $breakdown = $product['confidence_breakdown'] ?? [];
        if (($breakdown['name_match_level'] ?? null) !== 'exact') {
            return $parsed;
        }

        $parsedData = $parsed['parsed'] ?? [];
        $volume = $parsedData['volume'] ?? null;
        $concentration = $parsedData['concentration'] ?? null;
        $isTester = (bool) ($parsedData['is_tester'] ?? false);
        if ($volume === null || !is_string($concentration) || $concentration === '') {
            return $parsed;
        }

        $supplierPrice = $this->toFloat($row['supplier_price'] ?? null);
        if ($supplierPrice === null || $supplierPrice <= 0) {
            return $parsed;
        }

        $productId = (int) ($product['id'] ?? 0);
        if ($productId <= 0) {
            return $parsed;
        }

        // Ищем объект продукта в in-memory индексе, чтобы дописать в него
        // новый вариант (без перезагрузки из БД) — так последующие строки
        // того же батча сразу увидят его через матчер.
        $productModel = null;
        foreach ($productsIndex as $productsInBrand) {
            foreach ($productsInBrand as $candidate) {
                if ((int) $candidate->id === $productId) {
                    $productModel = $candidate;
                    break 2;
                }
            }
        }

        $definition = VariantDefinition::query()
            ->where('volume_ml', (int) round((float) $volume))
            ->where('concentration_code', $concentration)
            ->where('is_tester', $isTester)
            ->first();
        if (!$definition) {
            return $parsed;
        }

        $link = ProductVariantLink::query()->firstOrCreate(
            [
                'product_id' => $productId,
                'variant_definition_id' => $definition->id,
            ],
            [
                'price' => 0,
                'stock' => 0,
                'is_preorder' => false,
                'is_active' => false,
                'sort_order' => (int) ($definition->sort_order ?? 0),
            ]
        );
        $link->setRelation('definition', $definition);
        if ($productModel) {
            $link->setRelation('product', $productModel);

            // Пуш в in-memory индекс — чтобы последующие строки того же прайса,
            // ссылающиеся на этот же линк, матчились напрямую без повторной
            // вставки в БД (unique-constraint бы отработал, но это лишний запрос).
            $existingVariants = $productModel->variants;
            if ($existingVariants instanceof \Illuminate\Support\Collection) {
                $existingVariants->push($link);
            } else {
                $productModel->setRelation('variants', collect([$link]));
            }
        }

        // Собираем suggested_variant/suggested_product, как это делает матчер
        // для полностью найденного матча — total=100%, оба бонуса засчитаны.
        $autoBreakdown = [
            'total' => 100,
            'name_percent' => 90.0,
            'name_points' => 80,
            'name_match_level' => 'exact',
            'volume_match' => true,
            'volume_points' => 12,
            'concentration_match' => true,
            'concentration_points' => 8,
            'tester_match' => true,
            'tester_points' => 0,
            'has_variant' => true,
            'auto_created_variant' => true,
        ];

        $parsed['suggested_variant'] = [
            'id' => $link->id,
            'product_id' => $link->product_id,
            'product_name' => $productModel?->name ?? ($product['name'] ?? null),
            'brand_name' => $productModel?->brand?->name ?? ($product['brand_name'] ?? null),
            'display' => $this->variantMatcher->buildVariantLabel($link),
            'confidence' => 100,
            'confidence_breakdown' => $autoBreakdown,
        ];
        $parsed['suggested_product']['confidence'] = 100;
        $parsed['suggested_product']['confidence_breakdown'] = $autoBreakdown;
        $parsed['suggested_product']['has_variant'] = true;
        $parsed['suggested_product']['variants_count'] = (int) ($parsed['suggested_product']['variants_count'] ?? 0) + 1;
        $parsed['selected_variant_id'] = $link->id;

        return $parsed;
    }

    private function tryAutoConfirmLink(Supplier $supplier, SupplierProduct $supplierProduct, array $parsed): void
    {
        $confidence = (int) (($parsed['suggested_variant']['confidence'] ?? 0));
        $variantId = (int) (($parsed['suggested_variant']['id'] ?? 0));
        if ($confidence < 95 || $variantId <= 0) {
            return;
        }

        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
        if (
            $supplierProduct->is_linked &&
            (int) ($payload['linked_variant_id'] ?? 0) === $variantId
        ) {
            return;
        }

        $variant = ProductVariant::query()->with('product')->find($variantId);
        if (!$variant || !$variant->product) {
            return;
        }

        $externalCode = (string) ($payload['external_code'] ?? str_replace('supplier-xls://', '', (string) $supplierProduct->external_url));
        $supplierPrice = $this->toFloat($payload['supplier_price'] ?? ($payload['min_price'] ?? null));

        $this->linkSupplierProductToVariant(
            $supplier,
            $supplierProduct,
            $variant,
            $externalCode,
            $supplierPrice,
            'auto_95'
        );
    }

    private function linkSupplierProductToVariant(
        Supplier $supplier,
        SupplierProduct $supplierProduct,
        ProductVariant $variant,
        string $externalCode,
        ?float $supplierPrice,
        string $linkType
    ): void {
        $product = $variant->product;
        if (!$product) {
            throw new InvalidArgumentException('Не найден продукт для выбранного варианта');
        }

        $basePrice = $supplierPrice;
        $resolvedPrice = $basePrice !== null
            ? $this->pricingService->calculateRetailPrice($basePrice)
            : ($variant->price !== null ? (float) $variant->price : null);
        if ($resolvedPrice === null) {
            throw new InvalidArgumentException('Невозможно связать: у варианта и в прайсе отсутствует цена');
        }

        DB::transaction(function () use ($supplier, $supplierProduct, $variant, $product, $externalCode, $supplierPrice, $resolvedPrice, $linkType) {
            SupplierVariantOffer::query()
                ->where('supplier_id', $supplier->id)
                ->where('external_id', $externalCode)
                ->delete();

            $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
            $variant->update([
                'price' => $resolvedPrice,
                'stock' => max((int) ($variant->stock ?? 0), 1),
                'is_preorder' => false,
                'is_active' => true,
            ]);

            $product->update([
                'is_out_of_stock' => false,
            ]);

            $supplierProduct->update([
                'brand_id' => $product->brand_id,
                'product_id' => $product->id,
                'is_linked' => true,
                'last_seen_at' => now(),
                'payload' => [
                    ...$payload,
                    'is_new' => false,
                    'linked_variant_id' => $variant->id,
                    'link_type' => $linkType,
                ],
            ]);

            $offer = SupplierVariantOffer::query()->updateOrCreate(
                [
                    'supplier_id' => $supplier->id,
                    'product_variant_id' => $variant->id,
                    'external_id' => $externalCode,
                ],
                [
                    'external_product_url' => $supplierProduct->external_url,
                    'external_product_name' => $supplierProduct->external_name,
                    'external_variant_name' => $this->buildVariantLabel($variant),
                    'sku' => $externalCode,
                    'price' => $resolvedPrice,
                    'purchase_price' => $supplierPrice,
                    'is_active' => true,
                    'last_seen_at' => now(),
                    'last_synced_at' => now(),
                    'payload' => [
                        'source' => 'seller-one-xls',
                        'external_code' => $externalCode,
                        'supplier_price' => $supplierPrice,
                    ],
                ]
            );

            SupplierPriceHistory::query()->create([
                'supplier_variant_offer_id' => $offer->id,
                'price' => $offer->price,
                'old_price' => $offer->old_price,
                'stock' => (int) ($offer->stock ?? 0),
                'captured_at' => Carbon::now(),
            ]);
        });
    }

    private function buildVariantLabel(ProductVariant $variant): string
    {
        return $this->variantMatcher->buildVariantLabel($variant);
    }

    private function toFloat(mixed $value): ?float
    {
        return $this->variantMatcher->toFloat($value);
    }

    private function getOrCreateSellerOneSupplier(): Supplier
    {
        return Supplier::query()->firstOrCreate(
            ['code' => self::DEFAULT_SUPPLIER_CODE],
            [
                'name' => self::DEFAULT_SUPPLIER_NAME,
                'is_active' => true,
            ]
        );
    }

    /**
     * Продукты каталога, сгруппированные по brand_id. Варианты eager-loaded, чтобы матчер
     * мог посчитать бонус за совпадение объёма/концентрации, НЕ делая N+1.
     *
     * Важно: индексируем именно продукты (а не варианты). Это позволяет выдавать
     * suggested_product даже для продуктов без вариантов — поставщик всё равно совпадает,
     * а админ потом создаст нужный вариант.
     *
     * @return array<int, \Illuminate\Support\Collection<int, \Modules\Catalog\Models\Product>>
     */
    private function buildProductsIndex(): array
    {
        $products = Product::query()
            ->with(['brand', 'variants.definition'])
            ->get();

        $grouped = [];
        foreach ($products as $product) {
            if (!$product->brand_id) {
                continue;
            }
            $grouped[$product->brand_id][] = $product;
        }

        return $grouped;
    }

}
