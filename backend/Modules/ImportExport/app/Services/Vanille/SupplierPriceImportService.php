<?php

namespace Modules\ImportExport\Services\Vanille;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Jobs\RunSellerOneParseJob;
use Modules\Catalog\Jobs\RunSellerOneRefreshLinkedPricesJob;
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
use Modules\Catalog\Models\SellerOneSetting;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Services\Pricing\VariantPromotionService;
use Modules\Catalog\Services\VariantSupplierRetailPriceService;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Services\Vanille\Parsers\SellerOneSpreadsheetParser;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePreviewSyncService;
use Modules\ImportExport\Services\Vanille\Support\SellerOnePricingService;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantLinkAutoCreator;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use Modules\Warehouse\Services\StockInventoryService;

class SupplierPriceImportService
{
    private const string DEFAULT_SUPPLIER_CODE = 'supplier-price-xls';
    private const string DEFAULT_SUPPLIER_NAME = 'Supplier XLS Price';

    /** product_attributes.id «Для кого» — должен совпадать с SellerOneVariantMatcher. */
    private const int GENDER_ATTRIBUTE_ID = 3;

    private const int LISTING_DIAGNOSTIC_SAMPLE_LIMIT = 80;

    public const SETTING_LAST_PRICE_APPLY_AT = 'seller_one.last_price_apply_at';
    public const SETTING_LAST_PRICE_APPLY_FILE = 'seller_one.last_price_apply_file_name';
    public function __construct(
        private readonly SellerOneVariantMatcher $variantMatcher,
        private readonly SellerOneVariantLinkAutoCreator $variantLinkAutoCreator,
        private readonly SellerOneSpreadsheetParser $spreadsheetParser,
        private readonly SellerOnePricingService $pricingService,
        private readonly SellerOnePreviewSyncService $previewSyncService,
        private readonly StockInventoryService $stockInventory,
        private readonly VariantSupplierRetailPriceService $variantRetailPriceService,
        private readonly VariantPromotionService $promotionService,
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

    public function getLastPriceApplyMeta(): array
    {
        $stored = SellerOneSetting::query()
            ->whereIn('key', [
                self::SETTING_LAST_PRICE_APPLY_AT,
                self::SETTING_LAST_PRICE_APPLY_FILE,
            ])
            ->pluck('value', 'key');

        $appliedAt = trim((string) ($stored->get(self::SETTING_LAST_PRICE_APPLY_AT) ?? ''));

        return [
            'last_price_apply_at' => $appliedAt !== '' ? $appliedAt : null,
            'last_price_apply_file_name' => trim((string) ($stored->get(self::SETTING_LAST_PRICE_APPLY_FILE) ?? '')) ?: null,
        ];
    }

    public function recordLastPriceApply(?string $fileName = null): void
    {
        $now = now()->toDateTimeString();

        SellerOneSetting::query()->updateOrCreate(
            ['key' => self::SETTING_LAST_PRICE_APPLY_AT],
            ['value' => $now],
        );

        if ($fileName !== null && trim($fileName) !== '') {
            SellerOneSetting::query()->updateOrCreate(
                ['key' => self::SETTING_LAST_PRICE_APPLY_FILE],
                ['value' => trim($fileName)],
            );
        }
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

        $pausedCodes = [];
        foreach (SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('link_parsing_active', false)
            ->cursor() as $pausedRow) {
            $pp = is_array($pausedRow->payload) ? $pausedRow->payload : [];
            $c = trim((string) ($pp['external_code'] ?? str_replace('supplier-xls://', '', (string) $pausedRow->external_url)));
            if ($c !== '') {
                $pausedCodes[$c] = true;
            }
        }

        $matched = 0;
        $inserted = 0;
        $updated = 0;
        $skippedLinked = 0;
        $skippedParsingInactive = 0;
        $skippedSkipMarker = 0;
        $prepared = [];

        foreach ($rows as $row) {
            $externalCode = (string) ($row['code'] ?? '');
            if (isset($pausedCodes[$externalCode])) {
                $skippedParsingInactive++;

                continue;
            }
            if ($this->variantMatcher->shouldSkipParsingRow($row)) {
                $skippedSkipMarker++;

                continue;
            }
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
                },
                $existing,
            );
            if ($upsert === 'inserted') {
                $inserted++;
            } else {
                $updated++;
            }

            $prepared[] = $parsed;
        }

        $markedPreorder = 0;
        $markedAbsentUnlinked = 0;
        if ($isFinalBatch) {
            $allCodes = array_map(
                static fn (array $row): string => (string) ($row['code'] ?? ''),
                $allRows
            );
            $markedPreorder = $this->previewSyncService->markMissingSupplierCodesAsPreorder($supplier, $allCodes);
            $markedAbsentUnlinked = $this->previewSyncService->markAbsentUnlinkedForSellerOne($supplier, $allCodes);
            $this->previewSyncService->markLinkedMissingFromPriceFile($supplier, $allCodes);
        }

        return [
            'message' => 'Прайс обработан',
            'items' => count($prepared),
            'matched' => $matched,
            'unmatched' => count($prepared) - $matched,
            'inserted' => $inserted,
            'updated' => $updated,
            'skipped_linked' => $skippedLinked,
            'skipped_parsing_inactive' => $skippedParsingInactive,
            'skipped_skip_marker' => $skippedSkipMarker,
            'marked_absent_unlinked' => $markedAbsentUnlinked,
            'offset' => $offset,
            'limit' => $limit,
            'total_rows' => $totalRows,
            'processed' => count($prepared) + $skippedLinked + $skippedParsingInactive + $skippedSkipMarker,
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
        ?string $jobId = null,
        int $startOffset = 0,
        int $chunkTimeBudgetSeconds = 0,
    ): array {
        $batchSize = max($batchSize, 1);
        $isContinuation = $startOffset > 0;

        $supplier = $this->getOrCreateSellerOneSupplier();

        $this->reportParseProgress($onBatch, [
            'message' => $isContinuation ? 'Подготовка: продолжение парсинга…' : 'Подготовка: чтение файла…',
            'processed' => 0,
            'total_rows' => 0,
        ]);

        // XLSX парсим один раз за весь прогон: continuation-chunk'и читают строки
        // из сериализованного кэша (PhpSpreadsheet на слабом сервере — минуты на файл).
        $allRows = null;
        if ($isContinuation && $jobId !== null) {
            $allRows = $this->restoreParsedRows($jobId);
        }
        if ($allRows === null) {
            $allRows = $this->spreadsheetParser->readRowsFromPath($absolutePath);
            if ($jobId !== null) {
                $this->persistParsedRows($jobId, $allRows);
            }
        }
        $totalRows = count($allRows);

        $totalMatched = 0;
        $totalInserted = 0;
        $totalUpdated = 0;
        $totalSkippedLinked = 0;
        $totalSkippedParsingInactive = 0;
        $totalSkippedSkipMarker = 0;
        $totalProcessed = 0;

        if ($isContinuation && $jobId !== null) {
            $snap = \Illuminate\Support\Facades\Cache::get(
                \Modules\Catalog\Jobs\RunSellerOneParseJob::cacheKey($jobId)
            );
            if (is_array($snap)) {
                $totalMatched = (int) ($snap['matched'] ?? 0);
                $totalInserted = (int) ($snap['inserted'] ?? 0);
                $totalUpdated = (int) ($snap['updated'] ?? 0);
                $totalSkippedLinked = (int) ($snap['skipped_linked'] ?? 0);
                $totalSkippedParsingInactive = (int) ($snap['skipped_parsing_inactive'] ?? 0);
                $totalSkippedSkipMarker = (int) ($snap['skipped_skip_marker'] ?? 0);
                $totalProcessed = (int) ($snap['processed'] ?? 0);
            }
        }

        $this->reportParseProgress($onBatch, [
            'message' => $isContinuation ? 'Подготовка: загрузка каталога…' : 'Загрузка каталога…',
            'processed' => $totalProcessed,
            'total_rows' => $totalRows,
            'matched' => $totalMatched,
            'inserted' => $totalInserted,
            'updated' => $totalUpdated,
            'skipped_linked' => $totalSkippedLinked,
        ]);

        // Общие кэши на весь прогон (между chunk-джобами — файл на диске).
        $brands = Brand::query()->select(['id', 'name'])->get();
        $productsIndex = null;
        if ($isContinuation && $jobId !== null) {
            $productsIndex = $this->restoreProductsIndex($jobId);
        }
        if ($productsIndex === null) {
            $productsIndex = $this->buildProductsIndex();
            if ($jobId !== null) {
                $this->persistProductsIndex($jobId, $productsIndex);
            }
        }
        $rules = SellerOneMatchRule::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $pausedCodes = [];
        foreach (SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('link_parsing_active', false)
            ->cursor() as $pausedRow) {
            $pp = is_array($pausedRow->payload) ? $pausedRow->payload : [];
            $c = trim((string) ($pp['external_code'] ?? str_replace('supplier-xls://', '', (string) $pausedRow->external_url)));
            if ($c !== '') {
                $pausedCodes[$c] = true;
            }
        }

        $this->reportParseProgress($onBatch, [
            'message' => $totalRows > 0
                ? "Обработка: {$totalProcessed} / {$totalRows}"
                : 'Обработка…',
            'processed' => $totalProcessed,
            'total_rows' => $totalRows,
            'matched' => $totalMatched,
            'inserted' => $totalInserted,
            'updated' => $totalUpdated,
            'skipped_linked' => $totalSkippedLinked,
        ]);

        $chunkStartedAt = time();
        $stoppedEarly = false;
        $nextOffset = $totalRows;

        for ($offset = $startOffset; $offset < $totalRows; $offset += $batchSize) {
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
                if (isset($pausedCodes[$externalCode])) {
                    $totalSkippedParsingInactive++;
                    $totalProcessed++;

                    continue;
                }
                if ($this->variantMatcher->shouldSkipParsingRow($row)) {
                    $totalSkippedSkipMarker++;
                    $totalProcessed++;

                    continue;
                }
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
                    },
                    $existing,
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
                    'skipped_parsing_inactive' => $totalSkippedParsingInactive,
                    'skipped_skip_marker' => $totalSkippedSkipMarker,
                    'done' => false,
                ]);
            }

            unset($rows, $existingByUrl, $externalUrls);
            if (function_exists('gc_collect_cycles')) {
                gc_collect_cycles();
            }

            if (
                $chunkTimeBudgetSeconds > 0
                && (time() - $chunkStartedAt) >= $chunkTimeBudgetSeconds
                && ($offset + $batchSize) < $totalRows
            ) {
                $stoppedEarly = true;
                $nextOffset = $offset + $batchSize;
                break;
            }
        }

        $markedPreorder = 0;
        $markedAbsentUnlinked = 0;
        if ($stoppedEarly) {
            unset($allRows, $brands, $productsIndex, $rules);

            return [
                'message' => 'Продолжение парсинга',
                'total_rows' => $totalRows,
                'processed' => $totalProcessed,
                'matched' => $totalMatched,
                'inserted' => $totalInserted,
                'updated' => $totalUpdated,
                'skipped_linked' => $totalSkippedLinked,
                'skipped_parsing_inactive' => $totalSkippedParsingInactive,
                'skipped_skip_marker' => $totalSkippedSkipMarker,
                'marked_preorder' => 0,
                'marked_absent_unlinked' => 0,
                'has_more' => true,
                'next_offset' => $nextOffset,
            ];
        }

        if ($totalRows > 0) {
            $allCodes = array_map(
                static fn (array $row): string => (string) ($row['code'] ?? ''),
                $allRows,
            );
            $markedPreorder = $this->previewSyncService->markMissingSupplierCodesAsPreorder(
                $supplier,
                $allCodes,
            );
            $markedAbsentUnlinked = $this->previewSyncService->markAbsentUnlinkedForSellerOne($supplier, $allCodes);
            $this->previewSyncService->markLinkedMissingFromPriceFile($supplier, $allCodes);
            unset($allCodes);
        }

        $parseDiagnostics = $this->collectSellerOneParseDiagnostics($supplier, $allRows ?? []);

        unset($allRows, $brands, $productsIndex, $rules);

        $message = 'Прайс обработан';
        $diagParts = [];
        if ($parseDiagnostics['duplicate_variant_groups'] > 0) {
            $diagParts[] = sprintf(
                'дубли variant_id: %d групп (%d лишних связок)',
                $parseDiagnostics['duplicate_variant_groups'],
                $parseDiagnostics['duplicate_variant_extra_rows'],
            );
        }
        if ($parseDiagnostics['duplicate_file_code_extra_rows'] > 0) {
            $diagParts[] = sprintf(
                'повтор кода в файле: %d лишних строк',
                $parseDiagnostics['duplicate_file_code_extra_rows'],
            );
        }
        if ($parseDiagnostics['linked_rows'] > 0 && $parseDiagnostics['distinct_linked_variants'] !== $parseDiagnostics['linked_rows']) {
            $diagParts[] = sprintf(
                'связано строк: %d, уникальных variant_id: %d',
                $parseDiagnostics['linked_rows'],
                $parseDiagnostics['distinct_linked_variants'],
            );
        }
        if ($diagParts !== []) {
            $message .= '. Диагностика: '.implode('; ', $diagParts).'.';
        }

        return [
            'message' => $message,
            'total_rows' => $totalRows,
            'processed' => $totalProcessed,
            'matched' => $totalMatched,
            'inserted' => $totalInserted,
            'updated' => $totalUpdated,
            'skipped_linked' => $totalSkippedLinked,
            'skipped_parsing_inactive' => $totalSkippedParsingInactive,
            'skipped_skip_marker' => $totalSkippedSkipMarker,
            'marked_preorder' => $markedPreorder,
            'marked_absent_unlinked' => $markedAbsentUnlinked,
            'parse_diagnostics' => $parseDiagnostics,
            'has_more' => false,
            'next_offset' => $totalRows,
        ];
    }

    public function clearSellerOneParseArtifacts(?string $jobId): void
    {
        if ($jobId === null || $jobId === '') {
            return;
        }

        $this->removeProductsIndexCache($jobId);
        $this->removeParsedRowsCache($jobId);
    }

    public function refreshLinkedPrices(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        if ($path === false || !is_readable($path)) {
            throw new InvalidArgumentException('Не удалось прочитать файл');
        }

        return $this->refreshLinkedPricesFromAbsolutePath($path, null);
    }

    /**
     * Обновляет цены связанных строк и канал продажи «по прайсу» на витрине.
     * У поставщика нет флага наличия — только код и цена. Код в файле + связка → витрина включена.
     * Снятие с витрины — только если кода нет в новом файле (см. missing_codes).
     *
     * @param  callable(array<string, mixed>): void|null  $onProgress
     * @return array{
     *     message: string,
     *     updated: int,
     *     skipped: int,
     *     price_history_rows: int,
     *     price_changed: int,
     *     became_in_stock: int,
     *     missing_codes: int,
     *     deactivated_offers: int,
     *     deactivated_variants: int,
     *     cleared_supplier_shelf_variants: int,
     *     codes_in_price: int,
     *     linked_products: int,
     *     listing_diagnostics: array{
     *         distinct_variants_updated: int,
     *         duplicate_variant_in_batch: int,
     *         already_listed_before_batch: int,
     *         not_listed_after_update: int,
     *         duplicate_variant_samples: list<array{code: string, variant_id: int, first_code: string, name: string}>,
     *         already_listed_samples: list<array{code: string, variant_id: int, name: string}>,
     *         not_listed_samples: list<array{code: string, variant_id: int, name: string, reasons: list<string>}>
     *     }
     * }
     */
    public function refreshLinkedPricesFromAbsolutePath(string $absolutePath, ?callable $onProgress = null): array
    {
        if (!is_readable($absolutePath)) {
            throw new InvalidArgumentException('Файл недоступен для чтения');
        }

        $supplier = $this->getOrCreateSellerOneSupplier();
        $rows = $this->spreadsheetParser->readRowsFromPath($absolutePath);

        $rowByCode = [];
        foreach ($rows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            if ($code === '') {
                continue;
            }
            $rowByCode[$code] = $row;
        }

        $codesInPrice = array_keys($rowByCode);

        $linkedProducts = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_linked', true)
            ->where('link_parsing_active', true)
            ->get();

        $updated = 0;
        $skipped = 0;
        $missingCodes = [];
        /** @var list<int> */
        $missingSupplierProductIds = [];
        $priceHistoryRows = 0;
        $priceChanged = 0;
        $becameInStock = 0;

        /** @var array<int, string> variant_id → первый код, включивший вариант на витрину в этом прогоне */
        $variantFirstListedCodeInBatch = [];
        $duplicateVariantInBatch = 0;
        $alreadyListedBeforeBatch = 0;
        $notListedAfterUpdate = 0;
        /** @var list<array{code: string, variant_id: int, first_code: string, name: string}> */
        $duplicateVariantSamples = [];
        /** @var list<array{code: string, variant_id: int, name: string}> */
        $alreadyListedSamples = [];
        /** @var list<array{code: string, variant_id: int, name: string, reasons: list<string>}> */
        $notListedSamples = [];

        $totalLinked = $linkedProducts->count();
        if ($onProgress !== null) {
            $onProgress([
                'processed' => 0,
                'total_linked' => $totalLinked,
                'updated' => 0,
                'skipped' => 0,
                'price_history_rows' => 0,
                'price_changed' => 0,
                'became_in_stock' => 0,
                'message' => $totalLinked > 0
                    ? "Связанных строк: {$totalLinked}, чтение прайса завершено"
                    : 'Нет связанных строк для обновления',
            ]);
        }

        /** @var array<int, true> Продукты, для которых отложен syncProductStockFlagsByProductId (иначе тысячи тяжёлых синхронизаций подряд). */
        $deferredStockProductIds = [];

        /** @var array<string, bool> Внешние коды, которые есть в прайсе, у связки и проходят фильтр по цене. */
        $codesEligibleForBatch = [];

        foreach ($linkedProducts as $spWarm) {
            $pw = is_array($spWarm->payload) ? $spWarm->payload : [];
            $ecw = trim((string) ($pw['external_code'] ?? str_replace('supplier-xls://', '', (string) $spWarm->external_url)));
            if ($ecw === '' || !isset($rowByCode[$ecw])) {
                continue;
            }
            if ($this->variantMatcher->shouldSkipParsingRow($rowByCode[$ecw])) {
                continue;
            }
            if ($this->toFloat($rowByCode[$ecw]['supplier_price'] ?? null) === null) {
                continue;
            }
            $codesEligibleForBatch[$ecw] = true;
        }

        /** @var Collection<string, Collection<int, SupplierVariantOffer>> */
        $offersGroupedByExternal = Collection::make();
        $eligibleList = array_keys($codesEligibleForBatch);
        if ($eligibleList !== []) {
            $offersGroupedByExternal = SupplierVariantOffer::query()
                ->where('supplier_id', $supplier->id)
                ->whereIn('external_id', $eligibleList)
                ->get()
                ->groupBy(static fn ($o): string => (string) $o->external_id);
        }

        /** @var Collection<int, ProductVariant> */
        $variantsPreloadedById = Collection::make();
        $variantPksWarm = [];

        foreach ($linkedProducts as $spWarm2) {
            $pw = is_array($spWarm2->payload) ? $spWarm2->payload : [];
            $ecw = trim((string) ($pw['external_code'] ?? str_replace('supplier-xls://', '', (string) $spWarm2->external_url)));
            if ($ecw === '' || !isset($codesEligibleForBatch[$ecw])) {
                continue;
            }
            $warmVid = (int) ($pw['linked_variant_id'] ?? 0);
            if ($warmVid <= 0) {
                $bucketWarm = $offersGroupedByExternal->get($ecw);
                if ($bucketWarm instanceof Collection && $bucketWarm->isNotEmpty()) {
                    $warmVid = (int) ($bucketWarm->first()?->product_variant_id ?? 0);
                }
            }
            if ($warmVid > 0) {
                $variantPksWarm[$warmVid] = true;
            }
        }

        if ($variantPksWarm !== []) {
            $variantsPreloadedById = ProductVariant::query()
                ->with('product')
                ->whereIn('id', array_keys($variantPksWarm))
                ->get()
                ->keyBy('id');
        }

        $deferStockCb = static function (int $productId) use (&$deferredStockProductIds): void {
            if ($productId > 0) {
                $deferredStockProductIds[$productId] = true;
            }
        };

        /** @var array<int, true> */
        $touchedVariantIds = [];

        foreach ($linkedProducts as $index => $supplierProduct) {
            $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
            $externalCode = trim((string) ($payload['external_code'] ?? str_replace('supplier-xls://', '', (string) $supplierProduct->external_url)));
            if ($externalCode === '') {
                $skipped++;

                continue;
            }

            if (!isset($rowByCode[$externalCode])) {
                $missingCodes[] = $externalCode;
                $missingSupplierProductIds[] = (int) $supplierProduct->id;

                continue;
            }

            $row = $rowByCode[$externalCode];
            if ($this->variantMatcher->shouldSkipParsingRow($row)) {
                $skipped++;

                continue;
            }

            $supplierPrice = $this->toFloat($row['supplier_price'] ?? null);
            if ($supplierPrice === null) {
                $this->markLinkedSupplierRowInPriceFile(
                    $supplier,
                    $supplierProduct,
                    $externalCode,
                    $deferStockCb,
                );
                $skipped++;

                continue;
            }

            $fileInStock = true;

            $variantId = (int) ($payload['linked_variant_id'] ?? 0);
            if ($variantId <= 0) {
                $bucketVid = $offersGroupedByExternal->get($externalCode);
                if ($bucketVid instanceof Collection && $bucketVid->isNotEmpty()) {
                    $variantId = (int) ($bucketVid->first()?->product_variant_id ?? 0);
                }
            }
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

            $variant = $variantsPreloadedById->get($variantId)
                ?? ProductVariant::query()->with('product')->find($variantId);
            if (!$variant || !$variant->product) {
                $skipped++;

                continue;
            }

            $wasListed = CatalogVariantStockPresenter::supplierListingActive($variant);
            $resolvedPrice = $this->pricingService->calculateRetailPrice(
                $supplierPrice,
                $variant,
                (int) $supplier->id,
            );
            $offerBucketExisting = $offersGroupedByExternal->get($externalCode);
            $existingOffer = ($offerBucketExisting instanceof Collection && $offerBucketExisting->isNotEmpty())
                ? $offerBucketExisting->first()
                : SupplierVariantOffer::query()
                    ->where('supplier_id', $supplier->id)
                    ->where('external_id', $externalCode)
                    ->first();

            DB::transaction(function () use (
                $supplier,
                $supplierProduct,
                $variant,
                $externalCode,
                $supplierPrice,
                $resolvedPrice,
                $fileInStock,
                $existingOffer,
                &$updated,
                &$priceHistoryRows,
                &$priceChanged,
                $deferStockCb
            ): void {
                $supplierProduct->refresh();
                $variant->refresh();
                $variant->loadMissing('product');

                if ($existingOffer instanceof SupplierVariantOffer) {
                    $existingOffer->refresh();
                }

                /** «Старую» розницу для истории считаем из БД перед записью этой транзакцией (важно при retry после rollback). */
                $prevRetail = $existingOffer instanceof SupplierVariantOffer
                    ? (float) $existingOffer->price
                    : (float) ($variant->price ?? 0);

                $product = $variant->product;
                $existingPayload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];

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
                        'price_file_in_stock' => $fileInStock,
                    ],
                ]);

                $mergedOfferPayload = array_merge(
                    is_array($existingOffer?->payload) ? $existingOffer->payload : [],
                    [
                        'source' => 'seller-one-xls',
                        'external_code' => $externalCode,
                        'supplier_price' => $supplierPrice,
                    ],
                );
                unset(
                    $mergedOfferPayload['missing_in_latest_price'],
                    $mergedOfferPayload['missing_marked_at'],
                    $mergedOfferPayload['seller_one_listing_deferred'],
                    $mergedOfferPayload['out_of_stock_in_price_file'],
                    $mergedOfferPayload['out_of_stock_marked_at'],
                );

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
                        'payload' => $mergedOfferPayload,
                    ]
                );

                $this->previewSyncService->applyPriceFilePresenceToOffers(
                    (int) $supplier->id,
                    $externalCode,
                    $fileInStock,
                    $deferStockCb,
                );

                if (abs($prevRetail - $resolvedPrice) > 0.004) {
                    SupplierPriceHistory::query()->create([
                        'supplier_variant_offer_id' => $offer->id,
                        'price' => $resolvedPrice,
                        'old_price' => $prevRetail,
                        'stock' => (int) ($offer->stock ?? 0),
                        'captured_at' => Carbon::now(),
                    ]);
                    $priceHistoryRows++;
                    $priceChanged++;
                }

                $updated++;
            }, 8);

            $touchedVariantIds[(int) $variant->id] = true;

            $nowListed = CatalogVariantStockPresenter::supplierListingActive($variant);
            if ($nowListed && !$wasListed) {
                $becameInStock++;
                if (!isset($variantFirstListedCodeInBatch[$variantId])) {
                    $variantFirstListedCodeInBatch[$variantId] = $externalCode;
                }
                ProductVariantLink::query()
                    ->whereKey((int) $variant->id)
                    ->where('is_active', false)
                    ->update(['is_active' => true]);
            } elseif ($nowListed && $wasListed) {
                if (!isset($variantFirstListedCodeInBatch[$variantId])) {
                    $variantFirstListedCodeInBatch[$variantId] = $externalCode;
                    $alreadyListedBeforeBatch++;
                    if (count($alreadyListedSamples) < self::LISTING_DIAGNOSTIC_SAMPLE_LIMIT) {
                        $alreadyListedSamples[] = [
                            'code' => $externalCode,
                            'variant_id' => $variantId,
                            'name' => (string) $supplierProduct->external_name,
                        ];
                    }
                } elseif ($variantFirstListedCodeInBatch[$variantId] !== $externalCode) {
                    $duplicateVariantInBatch++;
                    if (count($duplicateVariantSamples) < self::LISTING_DIAGNOSTIC_SAMPLE_LIMIT) {
                        $duplicateVariantSamples[] = [
                            'code' => $externalCode,
                            'variant_id' => $variantId,
                            'first_code' => $variantFirstListedCodeInBatch[$variantId],
                            'name' => (string) $supplierProduct->external_name,
                        ];
                    }
                }
            } elseif (!$nowListed && !$wasListed) {
                $notListedAfterUpdate++;
                if (count($notListedSamples) < self::LISTING_DIAGNOSTIC_SAMPLE_LIMIT) {
                    $notListedSamples[] = [
                        'code' => $externalCode,
                        'variant_id' => $variantId,
                        'name' => (string) $supplierProduct->external_name,
                        'reasons' => $this->diagnoseSupplierListingBlockers($variant, (int) $supplier->id),
                    ];
                }
            }

            if (
                $onProgress !== null
                && $totalLinked > 0
                && (($index + 1) % 10 === 0 || ($index + 1) === $totalLinked)
            ) {
                $onProgress([
                    'processed' => $index + 1,
                    'total_linked' => $totalLinked,
                    'updated' => $updated,
                    'skipped' => $skipped,
                    'price_history_rows' => $priceHistoryRows,
                    'price_changed' => $priceChanged,
                    'became_in_stock' => $becameInStock,
                    'message' => 'Обновление цен: ' . ($index + 1) . " / {$totalLinked}",
                ]);
            }
        }

        $this->syncRetailPricesForVariants(array_keys($touchedVariantIds), (int) $supplier->id);

        $this->promotionService->clearPromotionForVariantsWithoutMainStock(array_keys($touchedVariantIds));

        foreach (array_keys($deferredStockProductIds) as $productIdSynced) {
            $this->stockInventory->syncProductStockFlagsByProductId((int) $productIdSynced);
        }

        $missingCodes = array_values(array_unique($missingCodes));
        $deactivatedOffers = 0;
        $clearedSupplierShelfVariants = 0;
        /** @var array<int, true> */
        $deferredMissingProductIds = [];

        if ($missingSupplierProductIds !== []) {
            SupplierProduct::query()
                ->where('supplier_id', $supplier->id)
                ->whereIn('id', array_values(array_unique($missingSupplierProductIds)))
                ->orderBy('id')
                ->chunkById(200, function ($chunk): void {
                    foreach ($chunk as $supplierProduct) {
                        /** @var SupplierProduct $supplierProduct */
                        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
                        $supplierProduct->update([
                            'payload' => [
                                ...$payload,
                                'price_file_in_stock' => false,
                            ],
                        ]);
                    }
                });
        }

        if ($missingCodes !== []) {
            $deactivatedOffers = (int) DB::transaction(function () use (
                $supplier,
                $missingCodes
            ): int {
                $offers = SupplierVariantOffer::query()
                    ->where('supplier_id', $supplier->id)
                    ->whereIn('external_id', $missingCodes)
                    ->where('is_active', true)
                    ->get();

                $flaggedOffers = 0;
                foreach ($offers as $offer) {
                    $offerPayload = is_array($offer->payload) ? $offer->payload : [];
                    if (!empty($offerPayload['missing_in_latest_price'])) {
                        continue;
                    }
                    $offer->update([
                        'is_active' => false,
                        'payload' => [
                            ...$offerPayload,
                            'missing_in_latest_price' => true,
                            'missing_marked_at' => now()?->toDateTimeString(),
                        ],
                    ]);
                    $flaggedOffers++;
                }

                return $flaggedOffers;
            }, 8);

            $shelfVariantIds = SupplierVariantOffer::query()
                ->where('supplier_id', $supplier->id)
                ->whereIn('external_id', $missingCodes)
                ->whereNotNull('product_variant_id')
                ->pluck('product_variant_id')
                ->map(static fn ($id): int => (int) $id)
                ->unique()
                ->values()
                ->all();
            $this->stockInventory->clearSupplierWarehouseShelfForVariantIds($shelfVariantIds);
            $clearedSupplierShelfVariants = count($shelfVariantIds);

            foreach ($shelfVariantIds as $vid) {
                $productId = ProductVariantLink::query()->whereKey($vid)->value('product_id');
                if ($productId) {
                    $deferredMissingProductIds[(int) $productId] = true;
                }
            }

            $this->syncRetailPricesForVariants($shelfVariantIds, (int) $supplier->id);
            $this->promotionService->clearPromotionForVariantsWithoutMainStock($shelfVariantIds);
        }

        foreach (array_keys($deferredMissingProductIds) as $productIdSynced) {
            $this->stockInventory->syncProductStockFlagsByProductId((int) $productIdSynced);
        }

        $message = sprintf(
            'Готово: обработано %d связей, цена изменилась — %d, пропали из прайса — %d, появились на витрине — %d.',
            $updated,
            $priceChanged,
            count($missingCodes),
            $becameInStock,
        );

        $distinctVariantsUpdated = count($touchedVariantIds);
        $inStockGap = max(0, $updated - $becameInStock);
        $gapExplained = $duplicateVariantInBatch + $alreadyListedBeforeBatch + $notListedAfterUpdate;
        $gapUnexplained = $inStockGap - $gapExplained;
        $listingDiagnostics = [
            'rows_updated' => $updated,
            'became_in_stock' => $becameInStock,
            'in_stock_gap' => $inStockGap,
            'gap_duplicate_variant' => $duplicateVariantInBatch,
            'gap_already_listed' => $alreadyListedBeforeBatch,
            'gap_not_listed' => $notListedAfterUpdate,
            'gap_unexplained' => $gapUnexplained,
            'distinct_variants_updated' => $distinctVariantsUpdated,
            'duplicate_variant_in_batch' => $duplicateVariantInBatch,
            'already_listed_before_batch' => $alreadyListedBeforeBatch,
            'not_listed_after_update' => $notListedAfterUpdate,
            'duplicate_variant_samples' => $duplicateVariantSamples,
            'already_listed_samples' => $alreadyListedSamples,
            'not_listed_samples' => $notListedSamples,
        ];

        $diagParts = [];
        if ($duplicateVariantInBatch > 0) {
            $diagParts[] = sprintf('повтор варианта (несколько кодов → один variant_id): %d', $duplicateVariantInBatch);
        }
        if ($alreadyListedBeforeBatch > 0) {
            $diagParts[] = sprintf('уже на витрине до обработки строки: %d', $alreadyListedBeforeBatch);
        }
        if ($notListedAfterUpdate > 0) {
            $diagParts[] = sprintf('не вышли на витрину после обновления: %d', $notListedAfterUpdate);
        }
        if ($distinctVariantsUpdated > 0 && $distinctVariantsUpdated !== $updated) {
            $diagParts[] = sprintf('уникальных variant_id: %d (строк обновлено: %d)', $distinctVariantsUpdated, $updated);
        }
        if ($inStockGap > 0) {
            $diagParts[] = sprintf(
                'разница обработано−«на витрине»: %d (= повтор %d + уже на витрине %d + не на витрине %d%s)',
                $inStockGap,
                $duplicateVariantInBatch,
                $alreadyListedBeforeBatch,
                $notListedAfterUpdate,
                $gapUnexplained !== 0 ? ', неразобрано '.$gapUnexplained : '',
            );
        }
        if ($diagParts !== []) {
            $message .= ' Диагностика витрины: '.implode('; ', $diagParts).'.';
        }

        return [
            'message' => $message,
            'updated' => $updated,
            'skipped' => $skipped,
            'price_history_rows' => $priceHistoryRows,
            'price_changed' => $priceChanged,
            'became_in_stock' => $becameInStock,
            'missing_codes' => count($missingCodes),
            'deactivated_offers' => $deactivatedOffers,
            'deactivated_variants' => 0,
            'cleared_supplier_shelf_variants' => $clearedSupplierShelfVariants,
            'codes_in_price' => count($codesInPrice),
            'linked_products' => $linkedProducts->count(),
            'listing_diagnostics' => $listingDiagnostics,
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

    /**
     * Сбросить все связки Seller One (или все строки с подсказками) перед повторным парсингом.
     *
     * @return array{
     *     supplier_id: int,
     *     supplier_products_reset: int,
     *     offers_deleted: int,
     *     clear_suggestions: bool,
     * }
     */
    public function resetAllLinks(bool $clearSuggestions = false, ?callable $onProgress = null): array
    {
        $supplier = $this->getOrCreateSellerOneSupplier();

        $query = SupplierProduct::query()
            ->where('supplier_id', $supplier->id);

        if (!$clearSuggestions) {
            $query->where('is_linked', true);
        }

        $offersDeleted = SupplierVariantOffer::query()
            ->where('supplier_id', $supplier->id)
            ->delete();

        $resetCount = 0;

        $query->orderBy('id')->chunkById(500, function ($rows) use ($clearSuggestions, $onProgress, &$resetCount): void {
            foreach ($rows as $supplierProduct) {
                $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
                unset($payload['linked_variant_id'], $payload['link_type']);

                if ($clearSuggestions) {
                    unset(
                        $payload['suggested_variant_id'],
                        $payload['suggested_product_id'],
                        $payload['match_confidence'],
                        $payload['match_confidence_breakdown'],
                    );
                }

                $supplierProduct->update([
                    'brand_id' => null,
                    'product_id' => null,
                    'is_linked' => false,
                    'payload' => $payload,
                ]);

                $resetCount++;
            }

            if ($onProgress) {
                $onProgress($resetCount);
            }
        });

        return [
            'supplier_id' => (int) $supplier->id,
            'supplier_products_reset' => $resetCount,
            'offers_deleted' => $offersDeleted,
            'clear_suggestions' => $clearSuggestions,
        ];
    }

    /**
     * Полная очистка импортированных данных Seller One перед «чистым» парсингом.
     * Правила матча и настройки наценки сохраняются; каталог не трогаем.
     *
     * @return array{
     *     supplier_id: int,
     *     supplier_products_deleted: int,
     *     offers_deleted: int,
     *     price_history_deleted: int,
     *     settings_cleared: int,
     *     temp_files_removed: int
     * }
     */
    public function purgeAllSellerOneData(): array
    {
        $supplier = $this->getOrCreateSellerOneSupplier();
        $supplierId = (int) $supplier->id;

        $offerIds = SupplierVariantOffer::query()
            ->where('supplier_id', $supplierId)
            ->pluck('id');

        $priceHistoryDeleted = $offerIds->isEmpty()
            ? 0
            : SupplierPriceHistory::query()
                ->whereIn('supplier_variant_offer_id', $offerIds)
                ->delete();

        $offersDeleted = SupplierVariantOffer::query()
            ->where('supplier_id', $supplierId)
            ->delete();

        $productsDeleted = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->delete();

        $settingsCleared = SellerOneSetting::query()
            ->whereIn('key', [
                self::SETTING_LAST_PRICE_APPLY_AT,
                self::SETTING_LAST_PRICE_APPLY_FILE,
            ])
            ->delete();

        Cache::forget(RunSellerOneParseJob::activeKey());
        Cache::forget(RunSellerOneRefreshLinkedPricesJob::activeKey());

        $tempFilesRemoved = $this->purgeSellerOneStorageArtifacts();

        return [
            'supplier_id' => $supplierId,
            'supplier_products_deleted' => $productsDeleted,
            'offers_deleted' => $offersDeleted,
            'price_history_deleted' => $priceHistoryDeleted,
            'settings_cleared' => $settingsCleared,
            'temp_files_removed' => $tempFilesRemoved,
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
                                'seller_one_listing_deferred' => true,
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

                    $this->stockInventory->syncProductStockFlagsByProductId((int) $product->id);

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

    /**
     * @param  Collection<int, Brand>  $brands
     * @param  Collection<int, SellerOneMatchRule>  $rules
     * @param  array<int, list<Product>>  $productsIndex
     */
    private function parseSupplierRow(array $row, Collection $brands, Collection $rules, array $productsIndex): array
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
     *   существующий `tryAutoConfirmLink` (порог 100) привяжет supplier и
     *   через `linkSupplierProductToVariant` проставит retail-цену и оффер;
     *   витрина по прайсу включается после «Обновить цены» (см. seller_one_listing_deferred).
     *
     * Защиты от мусора:
     *   1) ТОЛЬКО при `name_match_level` в `exact`, `exact_multiset` (base = 80).
     *      На `partial` (base = 70) создавать опасно — лишнее слово у поставщика
     *      может означать другой продукт.
     *   2) Обязательны оба поля у поставщика: volume И concentration. Без них
     *      нет однозначной definition в справочнике.
     *   3) Обязателен `supplier_price > 0`. Иначе `linkSupplierProductToVariant`
     *      проставит цену 0 и вариант уедет в каталог по нулевой цене.
     *   4) `name_only` — нормальный кейс: имя совпало, но линка под объём/конц./тестер
     *      у продукта ещё нет (в т.ч. когда есть другие объёмы, например 100 мл, а в прайсе 50 мл).
     *      Блокируем только `variant_extra` — вариант уже найден с лишними словами в хвосте.
     *   5) В справочнике должна существовать VariantDefinition ровно под
     *      (volume_ml, concentration_code, is_tester, is_vial). Иначе пропускаем —
     *      значит, этот размер в каталоге в принципе не предусмотрен.
     *   6) `firstOrCreate` по unique-constraint (product_id, variant_definition_id)
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
        return $this->variantLinkAutoCreator->apply($parsed, $row, $productsIndex, requirePositiveSupplierPrice: true);
    }

    private function tryAutoConfirmLink(Supplier $supplier, SupplierProduct $supplierProduct, array $parsed): void
    {
        $confidence = (int) (($parsed['suggested_variant']['confidence'] ?? 0));
        $variantId = (int) (($parsed['suggested_variant']['id'] ?? 0));
        if ($confidence < 100 || $variantId <= 0) {
            return;
        }

        $nameLevel = (string) (($parsed['suggested_variant']['confidence_breakdown']['name_match_level'] ?? ''));
        if (! in_array($nameLevel, ['exact', 'exact_multiset'], true)) {
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
            'auto_100'
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
                        // До первого «Обновить цены» канал прайса на витрине не активен.
                        'seller_one_listing_deferred' => true,
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

        $syncedPrice = $this->variantRetailPriceService->syncFromListingOffers(
            $variant,
            fn (float $purchase): float => $this->pricingService->calculateRetailPrice($purchase),
        );
        if ($syncedPrice === null) {
            $variant->update(['price' => $resolvedPrice]);
        }

        $variant->refresh();
        if ($variant->product_id) {
            $this->stockInventory->syncProductStockFlagsByProductId((int) $variant->product_id);
        }
    }

    private function buildVariantLabel(ProductVariant $variant): string
    {
        return $this->variantMatcher->buildVariantLabel($variant);
    }

    public function listSellerOneDuplicateVariantLinkGroups(): array
    {
        $supplier = $this->getOrCreateSellerOneSupplier();
        $data = $this->collectLinkedVariantDuplicateGroups($supplier);
        $extraRows = 0;
        foreach ($data['groups'] as $group) {
            $extraRows += max(0, count($group['entries']) - 1);
        }

        return [
            'linked_rows' => $data['linked_rows'],
            'distinct_linked_variants' => $data['distinct_linked_variants'],
            'duplicate_variant_groups' => count($data['groups']),
            'duplicate_variant_extra_rows' => $extraRows,
            'groups' => $data['groups'],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $fileRows
     * @return array{
     *     linked_rows: int,
     *     distinct_linked_variants: int,
     *     duplicate_variant_extra_rows: int,
     *     duplicate_variant_groups: int,
     *     duplicate_variant_samples: list<array{variant_id: int, codes: list<string>, names: list<string>}>,
     *     duplicate_file_code_extra_rows: int,
     *     duplicate_file_code_samples: list<array{code: string, occurrences: int}>
     * }
     */
    private function collectSellerOneParseDiagnostics(Supplier $supplier, array $fileRows): array
    {
        $codeOccurrences = [];
        foreach ($fileRows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            if ($code === '') {
                continue;
            }
            $codeOccurrences[$code] = ($codeOccurrences[$code] ?? 0) + 1;
        }

        $duplicateFileCodeExtraRows = 0;
        /** @var list<array{code: string, occurrences: int}> */
        $duplicateFileCodeSamples = [];
        foreach ($codeOccurrences as $code => $count) {
            if ($count <= 1) {
                continue;
            }
            $duplicateFileCodeExtraRows += $count - 1;
            if (count($duplicateFileCodeSamples) < self::LISTING_DIAGNOSTIC_SAMPLE_LIMIT) {
                $duplicateFileCodeSamples[] = [
                    'code' => (string) $code,
                    'occurrences' => (int) $count,
                ];
            }
        }

        $variantDuplicates = $this->collectLinkedVariantDuplicateGroups($supplier);
        $duplicateVariantExtraRows = 0;
        foreach ($variantDuplicates['groups'] as $group) {
            $duplicateVariantExtraRows += max(0, count($group['entries']) - 1);
        }
        $duplicateVariantGroups = count($variantDuplicates['groups']);
        /** @var list<array{variant_id: int, codes: list<string>, names: list<string>}> */
        $duplicateVariantSamples = [];
        foreach ($variantDuplicates['groups'] as $group) {
            if (count($duplicateVariantSamples) >= self::LISTING_DIAGNOSTIC_SAMPLE_LIMIT) {
                break;
            }
            $duplicateVariantSamples[] = [
                'variant_id' => (int) $group['variant_id'],
                'codes' => array_values(array_map(static fn (array $e): string => (string) $e['code'], $group['entries'])),
                'names' => array_values(array_map(static fn (array $e): string => (string) $e['name'], $group['entries'])),
            ];
        }

        return [
            'linked_rows' => $variantDuplicates['linked_rows'],
            'distinct_linked_variants' => $variantDuplicates['distinct_linked_variants'],
            'duplicate_variant_extra_rows' => $duplicateVariantExtraRows,
            'duplicate_variant_groups' => $duplicateVariantGroups,
            'duplicate_variant_samples' => $duplicateVariantSamples,
            'duplicate_file_code_extra_rows' => $duplicateFileCodeExtraRows,
            'duplicate_file_code_samples' => $duplicateFileCodeSamples,
        ];
    }

    /**
     * @return array{
     *     linked_rows: int,
     *     distinct_linked_variants: int,
     *     groups: list<array{
     *         variant_id: int,
     *         entries: list<array{code: string, name: string, supplier_product_id: int}>
     *     }>
     * }
     */
    private function collectLinkedVariantDuplicateGroups(Supplier $supplier): array
    {
        $linkedProducts = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_linked', true)
            ->get(['id', 'external_name', 'payload', 'external_url']);

        $missingVariantCodes = [];
        /** @var array<int, list<array{code: string, name: string, supplier_product_id: int}>> */
        $byVariant = [];
        foreach ($linkedProducts as $supplierProduct) {
            $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
            $code = trim((string) ($payload['external_code'] ?? str_replace('supplier-xls://', '', (string) $supplierProduct->external_url)));
            $variantId = (int) ($payload['linked_variant_id'] ?? 0);
            if ($variantId <= 0 && $code !== '') {
                $missingVariantCodes[$code] = [
                    'code' => $code,
                    'name' => (string) $supplierProduct->external_name,
                    'supplier_product_id' => (int) $supplierProduct->id,
                ];
                continue;
            }
            if ($variantId <= 0) {
                continue;
            }
            $byVariant[$variantId][] = [
                'code' => $code,
                'name' => (string) $supplierProduct->external_name,
                'supplier_product_id' => (int) $supplierProduct->id,
            ];
        }

        if ($missingVariantCodes !== []) {
            $offersByCode = SupplierVariantOffer::query()
                ->where('supplier_id', $supplier->id)
                ->whereIn('external_id', array_keys($missingVariantCodes))
                ->get(['external_id', 'product_variant_id'])
                ->keyBy('external_id');

            foreach ($missingVariantCodes as $code => $meta) {
                $variantId = (int) ($offersByCode->get($code)?->product_variant_id ?? 0);
                if ($variantId <= 0) {
                    continue;
                }
                $byVariant[$variantId][] = $meta;
            }
        }

        /** @var list<array{variant_id: int, entries: list<array{code: string, name: string, supplier_product_id: int}>}> */
        $groups = [];
        foreach ($byVariant as $variantId => $entries) {
            if (count($entries) <= 1) {
                continue;
            }
            $groups[] = [
                'variant_id' => (int) $variantId,
                'entries' => $entries,
            ];
        }

        usort($groups, static fn (array $a, array $b): int => count($b['entries']) <=> count($a['entries']));

        return [
            'linked_rows' => $linkedProducts->count(),
            'distinct_linked_variants' => count($byVariant),
            'groups' => $groups,
        ];
    }

    private function toFloat(mixed $value): ?float
    {
        return $this->variantMatcher->toFloat($value);
    }

    /**
     * @return list<string>
     */
    private function diagnoseSupplierListingBlockers(ProductVariantLink $variant, int $supplierId): array
    {
        $reasons = [];
        $offers = SupplierVariantOffer::query()
            ->where('product_variant_id', $variant->id)
            ->where('supplier_id', $supplierId)
            ->get(['id', 'is_active', 'payload']);

        if ($offers->isEmpty()) {
            return ['no_supplier_offer'];
        }

        foreach ($offers as $offer) {
            $payload = is_array($offer->payload) ? $offer->payload : [];
            if (!$offer->is_active) {
                $reasons[] = 'offer_inactive';
            }
            if (!empty($payload['missing_in_latest_price'])) {
                $reasons[] = 'missing_in_latest_price';
            }
            if (!empty($payload['seller_one_listing_deferred'])) {
                $reasons[] = 'seller_one_listing_deferred';
            }
            if (!empty($payload['out_of_stock_in_price_file'])) {
                $reasons[] = 'out_of_stock_in_price_file';
            }
        }

        $linked = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->where('product_id', $variant->product_id)
            ->where('is_linked', true)
            ->where('is_active', true)
            ->where('link_parsing_active', true)
            ->exists();

        if (!$linked) {
            $reasons[] = 'no_active_supplier_product_link';
        }

        if ($reasons === [] && !CatalogVariantStockPresenter::supplierListingActive($variant)) {
            $reasons[] = 'listing_blocked_unknown';
        }

        return array_values(array_unique($reasons));
    }

    private function markLinkedSupplierRowInPriceFile(
        Supplier $supplier,
        SupplierProduct $supplierProduct,
        string $externalCode,
        ?callable $deferStockCb,
    ): void {
        $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
        $supplierProduct->update([
            'payload' => [
                ...$payload,
                'price_file_in_stock' => true,
            ],
        ]);

        $this->previewSyncService->applyPriceFilePresenceToOffers(
            (int) $supplier->id,
            $externalCode,
            true,
            $deferStockCb,
        );
    }

    public function getOrCreateSellerOneSupplier(): Supplier
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
     * attributeValues грузим ТОЛЬКО для атрибута «Для кого»: матчеру другие атрибуты
     * не нужны, а полный eager-load всех атрибутов раздувал индекс в разы
     * (память + время сериализации на диск между chunk-джобами).
     *
     * @return array<int, list<Product>>
     */
    private function buildProductsIndex(): array
    {
        $products = Product::query()
            ->with([
                'brand',
                'variants.definition',
                'attributeValues' => static fn ($q) => $q->where(
                    'product_attribute_id',
                    self::GENDER_ATTRIBUTE_ID,
                ),
                'attributeValues.selectedOptions',
            ])
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

    /**
     * @param  callable(array<string, mixed>): void|null  $onBatch
     * @param  array<string, mixed>  $payload
     */
    private function reportParseProgress(?callable $onBatch, array $payload): void
    {
        if ($onBatch) {
            $onBatch($payload);
        }
    }

    /**
     * @param  array<int, list<Product>>  $productsIndex
     */
    private function persistProductsIndex(string $jobId, array $productsIndex): void
    {
        $path = $this->productsIndexCachePath($jobId);
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }

        file_put_contents($path, serialize($productsIndex));
    }

    /**
     * @return array<int, list<Product>>|null
     */
    private function restoreProductsIndex(string $jobId): ?array
    {
        $path = $this->productsIndexCachePath($jobId);
        if (! is_file($path)) {
            return null;
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            return null;
        }

        $index = @unserialize($raw);
        if (! is_array($index)) {
            return null;
        }

        return $index;
    }

    private function removeProductsIndexCache(string $jobId): void
    {
        $path = $this->productsIndexCachePath($jobId);
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function productsIndexCachePath(string $jobId): string
    {
        return storage_path('app/seller-one-temp/catalog-index-'.$jobId.'.ser');
    }

    /**
     * @param  list<array{code: string, title: string, supplier_price: ?float, in_stock: ?bool}>  $rows
     */
    private function persistParsedRows(string $jobId, array $rows): void
    {
        $path = $this->parsedRowsCachePath($jobId);
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }

        file_put_contents($path, serialize($rows));
    }

    /**
     * @return list<array{code: string, title: string, supplier_price: ?float, in_stock: ?bool}>|null
     */
    private function restoreParsedRows(string $jobId): ?array
    {
        $path = $this->parsedRowsCachePath($jobId);
        if (! is_file($path)) {
            return null;
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            return null;
        }

        $rows = @unserialize($raw);

        return is_array($rows) ? $rows : null;
    }

    private function removeParsedRowsCache(string $jobId): void
    {
        $path = $this->parsedRowsCachePath($jobId);
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function parsedRowsCachePath(string $jobId): string
    {
        return storage_path('app/seller-one-temp/rows-'.$jobId.'.ser');
    }

    private function purgeSellerOneStorageArtifacts(): int
    {
        $dirs = [
            storage_path('app/seller-one-temp'),
            storage_path('app/private/seller-one-temp'),
            storage_path('app/private/seller-one-refresh-linked-temp'),
        ];

        $removed = 0;
        foreach ($dirs as $dir) {
            if (! is_dir($dir)) {
                continue;
            }

            foreach (glob($dir.'/*') ?: [] as $path) {
                if (! is_file($path)) {
                    continue;
                }

                if (@unlink($path)) {
                    $removed++;
                }
            }
        }

        return $removed;
    }

    /**
     * @param  list<int>  $variantIds
     */
    private function syncRetailPricesForVariants(array $variantIds, ?int $supplierId = null): void
    {
        $uniqueIds = array_values(array_unique(array_filter(
            array_map(static fn (mixed $id): int => (int) $id, $variantIds),
            static fn (int $id): bool => $id > 0,
        )));

        if ($uniqueIds === []) {
            return;
        }

        $variants = ProductVariant::query()->whereIn('id', $uniqueIds)->get();
        foreach ($variants as $variant) {
            $this->variantRetailPriceService->syncFromListingOffers(
                $variant,
                function (float $purchase) use ($variant, $supplierId): float {
                    return $this->pricingService->calculateRetailPrice(
                        $purchase,
                        $variant,
                        $supplierId,
                    );
                },
            );
        }
    }
}
