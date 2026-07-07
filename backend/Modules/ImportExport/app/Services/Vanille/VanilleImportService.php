<?php

namespace Modules\ImportExport\Services\Vanille;

use Illuminate\Contracts\Queue\Factory as QueueFactory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Support\Carbon;
use Modules\Catalog\Jobs\RunVanilleImportJob;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Catalog\Support\PublicStorageWriteGuard;
use Modules\ImportExport\Support\VanilleHelper;
use Modules\Catalog\Models\ProductVariant;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Models\VanilleImportJob;
use Modules\Catalog\Models\VanilleImportJobLog;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleAttributeParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleLinkCollector;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleOfferVariantParser;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleProductParser;
use Modules\ImportExport\Services\Vanille\Support\VanilleParsedImportGuard;
use Modules\ImportExport\Services\Vanille\Support\VanilleQueuedJobExecutor;
use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;
use Modules\Communications\Services\Notifications\ImportTelegramNotificationService;
use Modules\Catalog\Services\ProductDescriptionRewriter;
use Modules\Catalog\Services\SmartSearch\ProductSearchIndexer;
use Modules\ImportExport\Models\ImportRetryItem;
use Modules\ImportExport\Services\ImportRetryQueue;
use App\Services\AuditLogService;
use Throwable;

class VanilleImportService
{
    public const JOB_TYPE_PARSE_BRANDS = 'parse_brands';
    public const JOB_TYPE_COLLECT_LINKS = 'collect_links';
    public const JOB_TYPE_PARSE_PRODUCTS = 'parse_products';
    public const JOB_TYPE_IMPORT_PARSED_PRODUCTS = 'import_parsed_products';

    public const JOB_TYPE_PIPELINE_NEW_PRODUCTS = 'pipeline_new_products';

    public const JOB_TYPE_PIPELINE_REFRESH_ALL = 'pipeline_refresh_all';

    public const JOB_TYPE_PARSE_CATALOG_IMAGES = 'parse_catalog_images';

    public const JOB_TYPE_PARSE_PRODUCT_IMAGES = 'parse_product_images';

    public const JOB_TYPE_REWRITE_DESCRIPTIONS = 'rewrite_descriptions';

    public const JOB_TYPE_RETRY_FAILED = 'retry_failed';

    public const PARSE_PRODUCTS_MODE_FULL = 'full';

    public const PARSE_PRODUCTS_MODE_NEW_ONLY = 'new_only';

    public const PARSE_PRODUCTS_MODE_ERRORS_ONLY = 'errors_only';

    public function __construct(
        protected VanilleHttpClient $httpClient,
        protected VanilleProductParser $productParser,
        protected VanilleBrandParser $brandParser,
        protected VanilleLinkCollector $linkCollector,
        protected VanilleAttributeParser $attributeParser,
        protected VanilleOfferVariantParser $offerVariantParser,
        protected VanilleQueuedJobExecutor $queuedJobExecutor,
    ) {
    }

    public function importFromJsonFile(string $path, bool $publishExisting = false): array
    {
        if (!file_exists($path)) {
            return [
                'success' => false,
                'message' => "Файл не найден: {$path}",
                'imported' => 0,
                'updated' => 0,
                'errors' => 1,
                'items' => 0,
                'log' => [],
            ];
        }

        $json = file_get_contents($path);
        $items = json_decode($json, true);

        if (!is_array($items)) {
            return [
                'success' => false,
                'message' => 'Некорректный JSON',
                'imported' => 0,
                'updated' => 0,
                'errors' => 1,
                'items' => 0,
                'log' => [],
            ];
        }

        $supplier = Supplier::firstOrCreate(
            ['code' => 'vanille'],
            [
                'name' => 'Vanille',
                'base_url' => 'https://vanille.by',
                'is_active' => true,
            ]
        );

        $imported = 0;
        $updated = 0;
        $errors = 0;
        $log = [];
        $createdProducts = [];
        $updatedProducts = [];
        $brandSlugSet = Brand::query()
            ->pluck('slug')
            ->filter()
            ->mapWithKeys(static fn ($slug) => [mb_strtolower((string) $slug) => true])
            ->all();
        $brandByEquivalentKey = $this->buildBrandEquivalentLookup();
        $productSlugSet = Product::query()
            ->pluck('slug')
            ->filter()
            ->mapWithKeys(static fn ($slug) => [mb_strtolower((string) $slug) => true])
            ->all();

        $items = $this->deduplicateParsedItems($items);

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            if ($publishExisting) {
                $brandNameForCatalog = trim((string) ($item['brand'] ?? ''));
                if ($brandNameForCatalog !== '') {
                    $productUrlForCatalog = trim((string) ($item['url'] ?? ''));
                    $hadBrandInCatalog = VanilleBrandParser::findCatalogBrandRow($brandNameForCatalog, $productUrlForCatalog) !== null;
                    $ensuredBrand = VanilleBrandParser::ensureBrandRowInCatalogFile(
                        $brandNameForCatalog,
                        $productUrlForCatalog,
                    );
                    if (! $hadBrandInCatalog && $ensuredBrand !== null) {
                        $log[] = 'INFO: бренд добавлен в brands.json: ' . $brandNameForCatalog;
                    }
                }
            }

            $skipReason = VanilleParsedImportGuard::skipReason($item);
            if ($skipReason !== null) {
                $log[] = 'SKIP: ' . $skipReason . ' | ' . trim((string) ($item['url'] ?? ''));

                continue;
            }

            try {
                $newProductIdForLlm = null;
                $productIdForSearch = null;
                DB::transaction(function () use ($item, $supplier, $publishExisting, &$imported, &$updated, &$log, &$brandSlugSet, &$productSlugSet, &$brandByEquivalentKey, &$newProductIdForLlm, &$productIdForSearch) {
                    $brand = null;
                    $brandName = trim((string) ($item['brand'] ?? ''));
                    $catalogBrand = null;

                    if ($brandName !== '') {
                        $catalogBrand = VanilleBrandParser::findCatalogBrandRow(
                            $brandName,
                            trim((string) ($item['url'] ?? '')),
                        );
                        $brandSlug = trim((string) ($catalogBrand['slug'] ?? ''))
                            ?: VanilleHelper::slugify($brandName);
                        if ($brandSlug === '') {
                            $brandSlug = 'brand';
                        }
                        $brand = $this->resolveBrandForVanilleImport(
                            $brandName,
                            $catalogBrand,
                            $brandSlug,
                            $brandSlugSet,
                            $productSlugSet,
                            $brandByEquivalentKey,
                        );
                    }

                    $vanilleUrl = trim((string) ($item['url'] ?? ''));
                    $urlPathSlug = $vanilleUrl !== ''
                        ? $this->vanilleUrlPathSlug($this->normalizeVanilleProductInputToUrl($vanilleUrl))
                        : '';
                    $resolvedNames = $this->resolveImportedVanilleProductNames($item, $brand, $brandName, $catalogBrand);
                    $fullTitle = $resolvedNames['full_title'];
                    $productShortName = $resolvedNames['short_name'];
                    $displayName = $resolvedNames['display_name'];
                    $brandSlugForPath = $resolvedNames['brand_slug_for_path'];

                    $baseSlug = $urlPathSlug !== ''
                        ? $urlPathSlug
                        : ($brand
                            ? ProductDisplayName::buildSlug((string) $brand->slug, $productShortName)
                            : VanilleHelper::slugify($productShortName));
                    if ($baseSlug === '' || $baseSlug === (string) $brand?->slug) {
                        $urlTail = trim((string) parse_url($vanilleUrl, PHP_URL_PATH), '/');
                        $baseSlug = VanilleHelper::slugify($urlTail) ?: 'product';
                    }
                    $slug = $this->resolveUniqueSlugInMemory($baseSlug, $productSlugSet, $brandSlugSet);
                    $pathIdentityKey = ProductDisplayName::vanilleProductPathIdentityKey($brandSlugForPath, $vanilleUrl);
                    $existingProduct = $this->findExistingProductForVanilleImport(
                        $supplier,
                        $brand,
                        $slug,
                        $pathIdentityKey,
                        $vanilleUrl,
                    );

                    if ($existingProduct) {
                        // Массовый импорт: не перезаписываем название, H1, бренд, активность,
                        // описания, SEO, цены/наличие — только характеристики и недостающие варианты ниже.
                        $product = $existingProduct;
                        if ($publishExisting) {
                            $product->update([
                                'is_active' => true,
                                'name' => $productShortName,
                                'h1' => $displayName,
                            ]);
                            $log[] = 'INFO: одиночный импорт — товар опубликован и обновлены name/h1: ' . $displayName;
                        }
                    } else {
                        $product = Product::create([
                            'slug' => $slug,
                            'brand_id' => $brand?->id,
                            'main_category_id' => null,
                            'name' => $productShortName,
                            'h1' => $displayName,
                            'short_description' => mb_substr(trim(strip_tags($item['description'] ?? '')), 0, 1000),
                            'description' => $item['description'] ?? null,
                            'seo_title' => mb_substr(trim($item['page_title'] ?? $displayName), 0, 255),
                            'seo_description' => mb_substr(trim(strip_tags($item['description'] ?? '')), 0, 500),
                            'is_active' => true,
                            'is_new' => false,
                            'is_hit' => false,
                            'is_out_of_stock' => true,
                            'sort_order' => 0,
                        ]);
                        $newProductIdForLlm = (int) $product->id;
                    }
                    $productSlugSet[mb_strtolower((string) $product->slug)] = true;

                    SupplierProduct::updateOrCreate(
                        [
                            'supplier_id' => $supplier->id,
                            'external_url' => $vanilleUrl !== ''
                                ? $this->normalizeVanilleProductInputToUrl($vanilleUrl)
                                : ($item['url'] ?? null),
                        ],
                        [
                            'brand_id' => $brand?->id,
                            'product_id' => $product->id,
                            'external_name' => $fullTitle,
                            'external_slug' => VanilleHelper::slugify($fullTitle),
                            'is_linked' => true,
                            'is_active' => true,
                            'last_seen_at' => now(),
                            'payload' => $item,
                        ]
                    );


                    if ($existingProduct) {
                        $updated++;
                        $updatedProducts[] = [
                            'product_id' => (int) $product->id,
                            'name' => $displayName,
                            'slug' => (string) $product->slug,
                            'is_active' => (bool) $product->is_active,
                            'url' => trim((string) ($item['url'] ?? '')),
                        ];
                    } else {
                        $imported++;
                        $createdProducts[] = [
                            'product_id' => (int) $product->id,
                            'name' => $displayName,
                            'slug' => (string) $product->slug,
                            'is_active' => (bool) $product->is_active,
                            'url' => trim((string) ($item['url'] ?? '')),
                        ];
                    }

                    $this->attributeParser->syncProductAttributes(
                        $product->id,
                        $item['characteristics'] ?? []
                    );

                    $offers = is_array($item['offers'] ?? null) ? $item['offers'] : [];
                    $this->syncProductVariantsFromOffers($product, $offers);

                    if ($offers === []) {
                        $log[] = 'INFO: товар без вариантов создан: ' . $displayName;
                    }

                    $log[] = 'OK: ' . $displayName;
                    $productIdForSearch = (int) $product->id;
                });

                if (
                    $productIdForSearch !== null
                    && $productIdForSearch > 0
                    && (bool) config('services.catalog_search.enabled', false)
                ) {
                    app(ProductSearchIndexer::class)->queueProductSync($productIdForSearch, $publishExisting);
                }

                if ($newProductIdForLlm !== null && config('llm.rewrite_on_import')) {
                    $this->rewriteDescriptionForNewProductIfPossible($newProductIdForLlm);
                }

                $importedUrl = trim((string) ($item['url'] ?? ''));
                if ($importedUrl !== '') {
                    $this->appendUrlsToParsedManifest([$importedUrl]);
                }
            } catch (\Throwable $e) {
                $errors++;
                $log[] = 'ERROR: ' . ($item['name'] ?? 'unknown') . ' -> ' . $e->getMessage();
            }
        }

        $touched = $imported + $updated;

        return [
            'success' => $errors === 0 && ($touched > 0 || count($items) === 0),
            'message' => $errors === 0
                ? ($touched > 0 ? 'Импорт завершён' : 'Ни одна карточка не импортирована (см. log)')
                : 'Импорт завершён с ошибками',
            'imported' => $imported,
            'updated' => $updated,
            'errors' => $errors,
            'items' => count($items),
            'log' => $log,
            'created_products' => $createdProducts,
            'updated_products' => $updatedProducts,
        ];
    }

    protected function normalizePrice(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $value = strip_tags((string) $value);
        $value = str_replace(['BYN', ' '], '', $value);
        $value = str_replace(',', '.', $value);

        return is_numeric($value) ? number_format((float)$value, 2, '.', '') : null;
    }

    protected function normalizeStock(mixed $value): int
    {
        if ($value === null || $value === '') {
            return 0;
        }

        return (int)$value;
    }

    protected function refreshVariantAggregates(Product $product): void
    {
        $product->load('variants.supplierOffers');

        foreach ($product->variants as $variant) {
            $offers = $variant->supplierOffers
                ->where('is_active', true)
                ->sortBy('price')
                ->values();

            if ($offers->isEmpty()) {
                $variant->update([
                    'price' => null,
                    'stock' => 0,
                    'is_active' => false,
                ]);
                continue;
            }

            $bestOffer = $offers->first();

            $variant->update([
                'price' => $bestOffer->price,
                'stock' => (int)$offers->max('stock'),
                'is_active' => true,
                'is_preorder' => (bool)$offers->every(fn($offer) => $offer->is_preorder),
            ]);
        }
    }

    public function parseBrands(): array
    {
        try {
            $brands = VanilleBrandParser::filterExcludedListingRows($this->brandParser->parse());
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'message' => 'Не удалось загрузить страницу брендов: ' . $e->getMessage(),
                'count' => 0,
                'path' => null,
                'log' => [],
            ];
        }

        $path = $this->ensureVanilleImportDir() . '/brands.json';

        file_put_contents(
            $path,
            json_encode($brands, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );
        VanilleBrandParser::resetCatalogBrandRowsCache();

        return [
            'success' => true,
            'message' => 'Бренды успешно спарсены',
            'count' => count($brands),
            'path' => $path,
            'log' => [
                'brands parsed: ' . count($brands),
                'saved to: ' . $path,
            ],
        ];
    }

    public function enqueueJob(string $type): VanilleImportJob
    {
        if (VanilleImportJob::findLatestActive()) {
            throw new \RuntimeException('Уже выполняется задача парсинга Vanille. Дождитесь завершения.');
        }

        // Чистим payload'ы от предыдущих (возможно, failed) задач того же типа, чтобы worker,
        // поднявшийся после простоя, не вытащил "зомби" и не затёр новый job.
        $this->pruneOrphanQueuePayloads();

        $job = VanilleImportJob::query()->create([
            'type' => $type,
            'status' => 'pending',
            'progress' => 0,
            'message' => $this->queuedJobExecutor->label($type) . ': в очереди',
        ]);

        VanilleImportJobLog::query()->create([
            'vanille_import_job_id' => $job->id,
            'level' => 'info',
            'message' => $this->queuedJobExecutor->label($type) . ': задача поставлена в очередь',
            'context' => [
                'type' => $type,
            ],
        ]);

        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_VANILLE_IMPORT,
                $job->id,
                AuditLogService::ACTION_CREATED,
                $this->queuedJobExecutor->label($type) . ': задача поставлена в очередь',
                ['job_type' => $type],
            );
        } catch (Throwable) {
        }

        $this->dispatchRunJob($job);

        return $job->fresh();
    }

    protected function dispatchRunJob(VanilleImportJob $job): void
    {
        $connection = (string) config('queue.default');
        $queueName = (string) (config('queue.connections.' . $connection . '.queue') ?? 'default');

        try {
            RunVanilleImportJob::dispatch($job->id);
            // Не пишем в vanille_import_job_logs на каждую следующую пачку (это тысячи строк); статус задачи уже в БД.
        } catch (Throwable $e) {
            VanilleImportJobLog::query()->create([
                'vanille_import_job_id' => $job->id,
                'level' => 'error',
                'message' => 'Не удалось поставить задачу в очередь: ' . $e->getMessage(),
                'context' => [
                    'queue_connection' => $connection,
                    'queue_name' => $queueName,
                    'exception' => get_class($e),
                ],
            ]);

            $job->update([
                'status' => 'failed',
                'progress' => 100,
                'message' => $this->queuedJobExecutor->label($job->type) . ': ошибка диспатча в очередь',
                'error' => $e->getMessage(),
                'finished_at' => now(),
            ]);

            throw $e;
        }
    }

    /**
     * Выгребает из очереди осиротевшие payload'ы RunVanilleImportJob, чей VanilleImportJob
     * уже в терминальном статусе (failed / completed) или отсутствует.
     * Это защита от "зомби" после того, как стейл-детектор руками пометил запись как failed.
     */
    protected function pruneOrphanQueuePayloads(): void
    {
        try {
            $connection = (string) config('queue.default');
            $queueName = (string) (config('queue.connections.' . $connection . '.queue') ?? 'default');
            /** @var \Illuminate\Contracts\Queue\Queue $queue */
            $queue = app(QueueFactory::class)->connection($connection);

            // Ограничимся Redis/database-драйверами — у остальных pop() не гарантирован атомарно.
            if (!in_array($connection, ['redis', 'database'], true)) {
                return;
            }

            $requeue = [];
            $guard = 0;
            while ($guard++ < 500) {
                $popped = $queue->pop($queueName);
                if ($popped === null) {
                    break;
                }

                $payload = $popped->payload();
                $command = $payload['data']['command'] ?? null;
                $commandName = $payload['data']['commandName'] ?? null;

                $targetJobId = null;
                if ($commandName === RunVanilleImportJob::class && is_string($command)) {
                    try {
                        $instance = unserialize($command);
                        if ($instance instanceof RunVanilleImportJob) {
                            $targetJobId = $instance->jobId;
                        }
                    } catch (Throwable) {
                        // пропустим, payload оставим как есть (сверху вернём в очередь)
                    }
                }

                if ($targetJobId !== null) {
                    $target = VanilleImportJob::query()->find($targetJobId);
                    if (!$target || in_array($target->status, ['failed', 'completed'], true)) {
                        // это зомби — удаляем из очереди.
                        $popped->delete();
                        continue;
                    }
                }

                // Не наш джоб (или наш, но живой) — вернём обратно в очередь, пусть работает как работал.
                $requeue[] = $popped;
            }

            foreach ($requeue as $job) {
                $job->release(0);
            }
        } catch (Throwable $e) {
            Log::warning('pruneOrphanQueuePayloads: ' . $e->getMessage());
        }
    }

    public function enqueuePipelineNewProducts(): VanilleImportJob
    {
        return $this->enqueueJob(self::JOB_TYPE_PIPELINE_NEW_PRODUCTS);
    }

    public function enqueuePipelineRefreshAll(): VanilleImportJob
    {
        return $this->enqueueJob(self::JOB_TYPE_PIPELINE_REFRESH_ALL);
    }

    public function enqueueImportParsedProducts(): VanilleImportJob
    {
        return $this->enqueueJob(self::JOB_TYPE_IMPORT_PARSED_PRODUCTS);
    }

    /**
     * Только активная задача (pending/running). Завершённые не возвращаем — иначе UI «залипает» после перезагрузки.
     */
    public function getActiveImportJob(): ?VanilleImportJob
    {
        $this->failStaleActiveJobsIfDue();

        return VanilleImportJob::findLatestActive();
    }

    /**
     * Помечает зависшие pending/running. Не чаще раза в минуту и не более 25 id за запрос parse-status.
     */
    private function failStaleActiveJobsIfDue(): void
    {
        if (!Cache::add('vanille_import_stale_sweep', 1, 60)) {
            return;
        }

        $pendingStaleBefore = Carbon::now()->subMinutes(3);
        $runningStaleBefore = Carbon::now()->subMinutes(7);

        foreach (VanilleImportJob::staleActiveJobIds($pendingStaleBefore, $runningStaleBefore, 25) as $jobId) {
            $fresh = VanilleImportJob::query()->find($jobId);
            if (!$fresh || !in_array($fresh->status, VanilleImportJob::ACTIVE_STATUSES, true)) {
                continue;
            }

            $threshold = $fresh->status === VanilleImportJob::STATUS_PENDING
                ? $pendingStaleBefore
                : $runningStaleBefore;
            $reference = $fresh->updated_at ?? $fresh->created_at;
            if ($reference !== null && $reference->greaterThan($threshold)) {
                continue;
            }

            $this->markImportJobFailedAsStale($fresh);
        }
    }

    private function markImportJobFailedAsStale(VanilleImportJob $fresh): void
    {
        $wasPending = $fresh->status === VanilleImportJob::STATUS_PENDING;
        $reason = $wasPending ? 'worker_not_picked_up' : 'worker_died_mid_batch';
        $humanReason = $wasPending
            ? 'queue worker не подобрал задачу (не запущен или слушает не ту очередь)'
            : 'queue worker подхватил, но упал посреди пачки';
        $label = $this->queuedJobExecutor->label($fresh->type);
        $queueConnection = (string) config('queue.default');
        $queueName = (string) (config('queue.connections.' . $queueConnection . '.queue') ?? 'default');

        VanilleImportJobLog::query()->create([
            'vanille_import_job_id' => $fresh->id,
            'level' => 'error',
            'message' => sprintf('%s: %s', $label, $humanReason),
            'context' => [
                'reason' => $reason,
                'previous_status' => $fresh->status,
                'queue_connection' => $queueConnection,
                'queue_name' => $queueName,
                'hint' => $wasPending
                    ? 'php artisan catalog:vanille-queue status; убедись что запущен php artisan queue:work на том же connection'
                    : 'см. storage/logs/laravel.log и failed_jobs в момент последнего updated_at',
            ],
        ]);

        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_VANILLE_IMPORT,
                $fresh->id,
                AuditLogService::ACTION_FAILED,
                sprintf('%s: %s', $label, $humanReason),
                [
                    'reason' => $reason,
                    'job_type' => $fresh->type,
                    'previous_status' => $fresh->status,
                    'queue_connection' => $queueConnection,
                    'queue_name' => $queueName,
                ],
            );
        } catch (Throwable) {
        }

        $fresh->update([
            'status' => VanilleImportJob::STATUS_FAILED,
            'progress' => 100,
            'message' => sprintf('%s: %s', $label, $humanReason),
            'error' => $fresh->error ?: ($wasPending
                ? 'Queue worker не подобрал задачу из очереди.'
                : 'Queue worker перестал обновлять статус задачи.'),
            'finished_at' => now(),
        ]);
    }

    /**
     * Выполняет задачу до завершения синхронно, не отправляя её обратно в очередь.
     * Полезно как escape hatch, когда queue worker недоступен.
     */
    public function runJobToCompletionSync(int $jobId, int $maxIterations = 1000): VanilleImportJob
    {
        $iteration = 0;
        while (true) {
            if (++$iteration > $maxIterations) {
                throw new \RuntimeException('Превышено число итераций синхронного выполнения задачи.');
            }

            $this->runQueuedJob($jobId, dispatchNext: false);

            $fresh = VanilleImportJob::query()->find($jobId);
            if (!$fresh) {
                throw new \RuntimeException('Задача исчезла во время выполнения.');
            }

            if (in_array($fresh->status, ['completed', 'failed'], true)) {
                return $fresh;
            }
        }
    }

    public function runQueuedJob(int $jobId, bool $dispatchNext = true): void
    {
        $job = VanilleImportJob::query()->find($jobId);
        if (!$job) {
            return;
        }

        // Защита от "зомби": задача была помечена как failed/completed (например, детектором staleness
        // или руками администратора), но её payload остался в очереди и worker всё-таки её достал.
        // В таком случае просто выходим, не воскрешая задачу в running.
        if (in_array($job->status, ['failed', 'completed'], true)) {
            VanilleImportJobLog::query()->create([
                'vanille_import_job_id' => $job->id,
                'level' => 'warning',
                'message' => sprintf(
                    '%s: worker получил задачу в терминальном статусе (%s), выполнение пропущено',
                    $this->queuedJobExecutor->label($job->type),
                    $job->status,
                ),
                'context' => [
                    'reason' => 'terminal_status_skip',
                    'previous_status' => $job->status,
                ],
            ]);

            return;
        }

        // Не даём конкурирующим инстансам одного и того же "живого" джоба ломать друг друга,
        // если по какой-то причине в очередь попало несколько payload'ов с одним jobId.
        // WithoutOverlapping в RunVanilleImportJob уже защищает по cache-lock'у, это страховка уровня БД.
        $locked = DB::transaction(function () use ($job) {
            $row = VanilleImportJob::query()->whereKey($job->id)->lockForUpdate()->first();
            if (!$row) {
                return false;
            }
            if (in_array($row->status, ['failed', 'completed'], true)) {
                return false;
            }

            $row->update([
                'status' => 'running',
                'started_at' => $row->started_at ?? now(),
                'progress' => max(5, (int) $row->progress),
                'message' => $row->message ?: ($this->queuedJobExecutor->label($row->type) . ': старт'),
                'error' => null,
                'finished_at' => null,
            ]);

            return true;
        });

        if (!$locked) {
            return;
        }

        // Перечитываем строку после транзакции, чтобы дальше работать со свежими данными.
        $job = VanilleImportJob::query()->find($jobId);
        if (!$job) {
            return;
        }

        try {
            $priorResult = is_array($job->result) ? $job->result : [];

            $execution = $this->queuedJobExecutor->execute($job, $this);
            $done = (bool) ($execution['done'] ?? true);
            $progress = (int) ($execution['progress'] ?? ($done ? 100 : $job->progress));
            $message = (string) ($execution['message'] ?? $this->queuedJobExecutor->label($job->type));
            $result = is_array($execution['result'] ?? null) ? $execution['result'] : [];

            $logTick = (int) data_get($priorResult, 'log_tick', 0) + 1;
            $result['log_tick'] = $logTick;
            $this->persistImportJobProgressLog($job->id, $done, $message, $result, $logTick);

            if ($done) {
                $job->update([
                    'status' => 'completed',
                    'progress' => 100,
                    'message' => $message ?: ($this->queuedJobExecutor->label($job->type) . ': завершено'),
                    'result' => $result,
                    'finished_at' => now(),
                ]);

                try {
                    app(ImportTelegramNotificationService::class)->notifyVanilleJobFinished($job->fresh());
                } catch (Throwable) {
                }

                return;
            }

            $job->update([
                'status' => 'running',
                'progress' => max(5, min(95, $progress)),
                'message' => $message,
                'result' => $result,
            ]);

            if ($dispatchNext) {
                $this->dispatchRunJob($job);
            }
        } catch (Throwable $e) {
            $job->update([
                'status' => 'failed',
                'progress' => 100,
                'message' => $this->queuedJobExecutor->label($job->type) . ': ошибка',
                'error' => $e->getMessage(),
                'finished_at' => now(),
            ]);

            VanilleImportJobLog::query()->create([
                'vanille_import_job_id' => $job->id,
                'level' => 'error',
                'message' => $e->getMessage(),
                'context' => [
                    'exception' => $e::class,
                ],
            ]);

            try {
                app(AuditLogService::class)->record(
                    AuditLogService::ENTITY_VANILLE_IMPORT,
                    $job->id,
                    AuditLogService::ACTION_FAILED,
                    $e->getMessage(),
                    [
                        'exception' => $e::class,
                        'job_type' => $job->type,
                    ],
                );
            } catch (Throwable) {
            }

            try {
                app(ImportTelegramNotificationService::class)->notifyVanilleJobFinished($job->fresh());
            } catch (Throwable) {
            }
        }
    }

    public function collectProductLinks(
        int $offset = 0,
        int $limit = 100,
        ?int $maxLinks = null,
        bool $useBrandListingApi = true,
        bool $rebuildLinksFile = false,
    ): array
    {
        $brandsPath = storage_path('app/public/imports/vanille/brands.json');

        if (!file_exists($brandsPath)) {
            return [
                'success' => false,
                'message' => 'Сначала выполните парсинг брендов',
                'count' => 0,
                'path' => null,
                'log' => [],
                'offset' => $offset,
                'limit' => $limit,
                'done' => true,
            ];
        }

        $brands = json_decode(file_get_contents($brandsPath), true);

        if (!is_array($brands)) {
            return [
                'success' => false,
                'message' => 'Файл brands.json повреждён',
                'count' => 0,
                'path' => null,
                'log' => [],
                'offset' => $offset,
                'limit' => $limit,
                'done' => true,
            ];
        }

        $brands = VanilleBrandParser::filterExcludedListingRows($brands);

        $result = $this->linkCollector->collect($brands, $offset, $limit, $maxLinks, $useBrandListingApi);

        $path = $this->ensureVanilleImportDir() . '/product_links.json';
        $existingLinks = [];
        $existingKeysBeforeMerge = [];
        if ($rebuildLinksFile && $offset === 0) {
            $result['log'][] = 'product_links.json: полная пересборка с нуля';
        } elseif (file_exists($path)) {
            $decoded = json_decode(file_get_contents($path), true);
            if (is_array($decoded)) {
                foreach ($decoded as $link) {
                    if (!is_array($link)) {
                        continue;
                    }
                    $key = $this->buildLinkDedupKey($link);
                    if ($key === '') {
                        continue;
                    }
                    $existingLinks[$key] = $link;
                    $existingKeysBeforeMerge[$key] = true;
                }
            }
        }

        $addedLinks = [];
        foreach (($result['links'] ?? []) as $link) {
            if (!is_array($link)) {
                continue;
            }
            $slug = trim((string) ($link['slug'] ?? ''));
            if ($slug !== '' && !VanilleBrandParser::isValidBrandSlug($slug)) {
                continue;
            }
            $key = $this->buildLinkDedupKey($link);
            if ($key === '') {
                continue;
            }
            if (!isset($existingKeysBeforeMerge[$key])) {
                $addedLinks[] = $link;
            }
            $existingLinks[$key] = $link;
        }

        $mergedLinks = array_values($existingLinks);

        file_put_contents(
            $path,
            json_encode($mergedLinks, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        $finalize = ['brands_kept' => 0, 'brands_removed' => 0, 'links_kept' => count($mergedLinks)];
        if ($result['done']) {
            $finalize = $this->finalizeBrandsAndProductLinks();
            $mergedLinks = json_decode((string) file_get_contents($path), true);
            if (!is_array($mergedLinks)) {
                $mergedLinks = [];
            }
        }

        return [
            'success' => true,
            'message' => $result['done']
                ? 'Сбор ссылок завершён'
                : 'Пачка ссылок собрана',
            'count' => count($mergedLinks),
            'path' => $path,
            'log' => $result['log'],
            'offset' => $result['offset'],
            'limit' => $result['limit'],
            'next_offset' => $result['next_offset'],
            'done' => $result['done'],
            'processed_brands' => $result['processed_brands'],
            'total_brands' => $result['total_brands'],
            'max_links' => $result['max_links'],
            'reached_max_links' => $result['reached_max_links'],
            'added_links' => array_values($addedLinks),
            'added_links_count' => count($addedLinks),
            'brands_kept' => $finalize['brands_kept'],
            'brands_removed' => $finalize['brands_removed'],
            'links_kept' => $finalize['links_kept'],
        ];
    }

    /**
     * После полного сбора: в brands.json только бренды с ≥1 товарной ссылкой; product_links без «сирот».
     *
     * @return array{brands_kept: int, brands_removed: int, links_kept: int}
     */
    public function finalizeBrandsAndProductLinks(): array
    {
        $dir = $this->ensureVanilleImportDir();
        $brandsPath = $dir . '/brands.json';
        $linksPath = $dir . '/product_links.json';

        $brands = is_file($brandsPath)
            ? VanilleBrandParser::filterExcludedListingRows(json_decode((string) file_get_contents($brandsPath), true) ?: [])
            : [];
        $links = is_file($linksPath)
            ? (json_decode((string) file_get_contents($linksPath), true) ?: [])
            : [];
        if (!is_array($links)) {
            $links = [];
        }

        $nameToSlug = [];
        foreach ($brands as $row) {
            if (!is_array($row)) {
                continue;
            }
            $slug = mb_strtolower(trim((string) ($row['slug'] ?? '')), 'UTF-8');
            $name = mb_strtolower(trim((string) ($row['name'] ?? '')), 'UTF-8');
            if ($slug !== '' && $name !== '') {
                $nameToSlug[$name] = $slug;
            }
        }

        $linkCounts = [];
        $normalizedLinks = [];
        foreach ($links as $link) {
            if (!is_array($link)) {
                continue;
            }
            $brandSlug = mb_strtolower(trim((string) ($link['brand_slug'] ?? '')), 'UTF-8');
            if ($brandSlug === '') {
                $brandName = mb_strtolower(trim((string) ($link['brand'] ?? '')), 'UTF-8');
                $brandSlug = $nameToSlug[$brandName] ?? '';
                if ($brandSlug !== '') {
                    $link['brand_slug'] = $brandSlug;
                }
            }
            if ($brandSlug === '' || VanilleBrandParser::isGarbageBrandRow(
                (string) ($link['brand'] ?? ''),
                $brandSlug,
                (string) ($link['url'] ?? ''),
            )) {
                continue;
            }
            $linkCounts[$brandSlug] = ($linkCounts[$brandSlug] ?? 0) + 1;
            $key = $this->buildLinkDedupKey($link);
            if ($key !== '') {
                $normalizedLinks[$key] = $link;
            }
        }

        $keptBrands = [];
        foreach ($brands as $row) {
            if (!is_array($row)) {
                continue;
            }
            $slug = mb_strtolower(trim((string) ($row['slug'] ?? '')), 'UTF-8');
            if ($slug === '' || ($linkCounts[$slug] ?? 0) < 1) {
                continue;
            }
            $keptBrands[] = $row;
        }

        $keptSlugs = array_fill_keys(
            array_map(
                static fn (array $row): string => mb_strtolower(trim((string) ($row['slug'] ?? '')), 'UTF-8'),
                $keptBrands,
            ),
            true,
        );

        $filteredLinks = [];
        foreach ($normalizedLinks as $link) {
            $brandSlug = mb_strtolower(trim((string) ($link['brand_slug'] ?? '')), 'UTF-8');
            if ($brandSlug !== '' && isset($keptSlugs[$brandSlug])) {
                $filteredLinks[] = $link;
            }
        }

        file_put_contents($brandsPath, json_encode($keptBrands, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        file_put_contents($linksPath, json_encode(array_values($filteredLinks), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        return [
            'brands_kept' => count($keptBrands),
            'brands_removed' => max(0, count($brands) - count($keptBrands)),
            'links_kept' => count($filteredLinks),
        ];
    }

    public function parseProducts(
        int $offset = 0,
        int $limit = 20,
        ?int $maxLinks = null,
        string $mode = self::PARSE_PRODUCTS_MODE_FULL,
        ?string $linksFilePath = null,
    ): array {
        $newOnlyBuildMeta = null;
        if ($mode === self::PARSE_PRODUCTS_MODE_NEW_ONLY && $linksFilePath === null && $offset === 0) {
            $newOnlyBuildMeta = $this->buildNewOnlyProductLinksFile();
            $linksFilePath = (string) ($newOnlyBuildMeta['path'] ?? '');
            if ($linksFilePath === '') {
                throw new \RuntimeException('Не удалось подготовить файл ссылок для режима new_only');
            }
        }

        if ($mode === self::PARSE_PRODUCTS_MODE_ERRORS_ONLY && $linksFilePath === null) {
            $errorsLinksPath = $this->buildParseErrorsLinksFile();
            if ($errorsLinksPath === '') {
                return [
                    'success' => true,
                    'message' => 'Нет URL в parse_errors.json для повторного парсинга',
                    'count' => 0,
                    'errors' => 0,
                    'files' => [],
                    'log' => [],
                    'done' => true,
                    'offset' => 0,
                    'limit' => $limit,
                    'links_path' => $this->parseErrorsManifestPath(),
                    'parse_mode' => $mode,
                    'parse_errors_pending' => 0,
                ];
            }
            $linksFilePath = $errorsLinksPath;
        }

        $linksPath = $linksFilePath ?: ($this->ensureVanilleImportDir() . '/product_links.json');

        if (!file_exists($linksPath)) {
            return [
                'success' => false,
                'message' => 'Сначала выполните сбор ссылок товаров',
                'count' => 0,
                'errors' => 0,
                'files' => [],
                'log' => [],
                'done' => true,
                'offset' => $offset,
                'limit' => $limit,
                'links_path' => $linksPath,
                'parse_mode' => $mode,
            ];
        }

        $links = json_decode(file_get_contents($linksPath), true);

        if (!is_array($links)) {
            return [
                'success' => false,
                'message' => 'Файл со ссылками повреждён',
                'count' => 0,
                'errors' => 0,
                'files' => [],
                'log' => [],
                'done' => true,
                'offset' => $offset,
                'limit' => $limit,
                'links_path' => $linksPath,
                'parse_mode' => $mode,
            ];
        }

        $links = $this->deduplicateLinks($links);

        if ($maxLinks !== null) {
            $links = array_slice($links, 0, $maxLinks);
        }

        $chunk = array_slice($links, $offset, $limit);
        $processed = count($chunk);

        $items = [];
        $log = [];
        $errors = 0;
        $parsedUrls = [];
        $parsedProducts = [];
        if (is_array($newOnlyBuildMeta) && $offset === 0) {
            $skipped = (int) ($newOnlyBuildMeta['skipped_count'] ?? 0);
            if ($skipped > 0) {
                $log[] = 'SKIP: already parsed/imported -> ' . $skipped;
            }
        }

        foreach ($chunk as $index => $link) {
            $url = $link['url'] ?? null;

            if (!$url) {
                continue;
            }

            try {
                $item = $this->productParser->parseProductPage($url);
                $items[] = $item;
                $log[] = 'OK: ' . $url;
                $parsedUrls[] = $url;
                $this->removeParseError($url);
                $parsedProducts[] = [
                    'url' => $url,
                    'name' => trim((string) ($item['name'] ?? '')),
                ];
            } catch (\Throwable $e) {
                $errors++;
                $message = $e->getMessage();
                $log[] = 'ERROR: ' . $url . ' -> ' . $message;
                $this->recordParseError($url, $message);
            }

            if ($index !== array_key_last($chunk)) {
                usleep(50_000);
            }
        }

        if ($parsedUrls !== []) {
            $this->appendUrlsToParsedManifest($parsedUrls);
        }

        $dir = $this->ensureVanilleProductsDir();

        $fileIndex = (int) floor($offset / $limit) + 1;
        $filePath = $dir . '/products_' . str_pad((string) $fileIndex, 3, '0', STR_PAD_LEFT) . '.json';

        file_put_contents(
            $filePath,
            json_encode($items, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        $nextOffset = $offset + $processed;
        $done = $nextOffset >= count($links);

        $files = glob($dir . '/products_*.json') ?: [];
        sort($files);

        return [
            'success' => $errors === 0,
            'message' => $done
                ? 'Массовый парсинг карточек завершён'
                : 'Пачка карточек спарсена',
            'count' => count($items),
            'errors' => $errors,
            'files' => array_values($files),
            'last_file' => $filePath,
            'log' => $log,
            'offset' => $offset,
            'limit' => $limit,
            'next_offset' => $nextOffset,
            'done' => $done,
            'processed_links' => $processed,
            'total_links' => count($links),
            'max_links' => $maxLinks,
            'links_path' => $linksPath,
            'parse_mode' => $mode,
            'parsed_products' => $parsedProducts,
            'parsed_products_count' => count($parsedProducts),
        ];
    }


    public function importParsedProducts(): array
    {
        $dir = storage_path('app/public/imports/vanille/products');
        $files = glob($dir . '/products_*.json') ?: [];
        sort($files);

        if (empty($files)) {
            return [
                'success' => false,
                'message' => 'Файлы products_*.json не найдены',
                'imported' => 0,
                'updated' => 0,
                'errors' => 1,
                'items' => 0,
                'files' => [],
                'log' => [],
            ];
        }

        $totalImported = 0;
        $totalUpdated = 0;
        $totalErrors = 0;
        $totalItems = 0;
        $log = [];
        $createdProducts = [];
        $updatedProducts = [];

        foreach ($files as $file) {
            $result = $this->importFromJsonFile($file);

            $totalImported += (int) ($result['imported'] ?? 0);
            $totalUpdated += (int) ($result['updated'] ?? 0);
            $totalErrors += (int) ($result['errors'] ?? 0);
            $totalItems += (int) ($result['items'] ?? 0);
            foreach ((array) ($result['created_products'] ?? []) as $row) {
                if (is_array($row)) {
                    $createdProducts[] = $row;
                }
            }
            foreach ((array) ($result['updated_products'] ?? []) as $row) {
                if (is_array($row)) {
                    $updatedProducts[] = $row;
                }
            }

            $log[] = 'FILE: ' . basename($file);
            foreach (($result['log'] ?? []) as $line) {
                $log[] = $line;
            }
        }

        return [
            'success' => $totalErrors === 0,
            'message' => $totalErrors === 0
                ? 'Импорт спарсенных товаров завершён'
                : 'Импорт спарсенных товаров завершён с ошибками',
            'imported' => $totalImported,
            'updated' => $totalUpdated,
            'errors' => $totalErrors,
            'items' => $totalItems,
            'files' => array_values($files),
            'log' => $log,
            'created_products' => $createdProducts,
            'updated_products' => $updatedProducts,
        ];
    }

    public function importParsedProductsBatch(int $offset = 0, int $limitFiles = 1): array
    {
        $dir = storage_path('app/public/imports/vanille/products');
        $files = glob($dir . '/products_*.json') ?: [];
        sort($files);

        if ($files === []) {
            return [
                'success' => false,
                'message' => 'Файлы products_*.json не найдены',
                'imported' => 0,
                'updated' => 0,
                'errors' => 1,
                'items' => 0,
                'files' => [],
                'log' => [],
                'offset' => $offset,
                'next_offset' => $offset,
                'done' => true,
                'total_files' => 0,
                'processed_files' => 0,
            ];
        }

        $chunk = array_slice($files, $offset, max(1, $limitFiles));
        $processedFiles = count($chunk);
        $nextOffset = $offset + $processedFiles;
        $done = $nextOffset >= count($files);

        $totalImported = 0;
        $totalUpdated = 0;
        $totalErrors = 0;
        $totalItems = 0;
        $log = [];
        $createdProducts = [];
        $updatedProducts = [];

        foreach ($chunk as $file) {
            $result = $this->importFromJsonFile($file);
            $totalImported += (int) ($result['imported'] ?? 0);
            $totalUpdated += (int) ($result['updated'] ?? 0);
            $totalErrors += (int) ($result['errors'] ?? 0);
            $totalItems += (int) ($result['items'] ?? 0);
            foreach ((array) ($result['created_products'] ?? []) as $row) {
                if (is_array($row)) {
                    $createdProducts[] = $row;
                }
            }
            foreach ((array) ($result['updated_products'] ?? []) as $row) {
                if (is_array($row)) {
                    $updatedProducts[] = $row;
                }
            }

            $log[] = 'FILE: ' . basename($file);
            foreach (($result['log'] ?? []) as $line) {
                $log[] = $line;
            }
        }

        return [
            'success' => $totalErrors === 0,
            'message' => $done
                ? ($totalErrors === 0 ? 'Импорт спарсенных товаров завершён' : 'Импорт спарсенных товаров завершён с ошибками')
                : 'Импорт спарсенных товаров выполняется',
            'imported' => $totalImported,
            'updated' => $totalUpdated,
            'errors' => $totalErrors,
            'items' => $totalItems,
            'files' => $chunk,
            'log' => $log,
            'offset' => $offset,
            'next_offset' => $nextOffset,
            'done' => $done,
            'total_files' => count($files),
            'processed_files' => $processedFiles,
            'created_products' => $createdProducts,
            'updated_products' => $updatedProducts,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $offers
     */
    public function syncProductVariantsFromOffers(Product $product, array $offers): int
    {
        $created = 0;

        foreach ($offers as $index => $offer) {
            if (!is_array($offer)) {
                continue;
            }

            $parsed = $this->offerVariantParser->parseVariant($offer);
            $definition = $this->offerVariantParser->resolveVariantDefinition($parsed);
            if (!$definition) {
                continue;
            }

            $variant = ProductVariant::where([
                'product_id' => $product->id,
                'variant_definition_id' => $definition->id,
            ])->first();

            if ($variant) {
                continue;
            }

            ProductVariant::create([
                'product_id' => $product->id,
                'variant_definition_id' => $definition->id,
                'price' => null,
                'stock' => 0,
                'is_preorder' => false,
                'is_active' => true,
                'sort_order' => $index,
            ]);
            $created++;
        }

        return $created;
    }

    /**
     * @return array{
     *     success: bool,
     *     message: string,
     *     processed: int,
     *     variants_created: int,
     *     offers_refreshed: int,
     *     errors: int,
     *     offset: int,
     *     next_offset: int,
     *     total: int,
     *     done: bool,
     *     log: list<string>
     * }
     */
    public function repairVanilleVariantsBatch(
        int $offset = 0,
        int $limit = 20,
        bool $onlyMissingVariants = true,
        bool $reparseFromUrl = true,
        bool $dryRun = false,
    ): array {
        $supplier = Supplier::query()->where('code', 'vanille')->first();
        if (!$supplier) {
            return [
                'success' => false,
                'message' => 'Поставщик vanille не найден',
                'processed' => 0,
                'variants_created' => 0,
                'offers_refreshed' => 0,
                'errors' => 0,
                'offset' => $offset,
                'next_offset' => $offset,
                'total' => 0,
                'done' => true,
                'log' => [],
            ];
        }

        $query = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_linked', true)
            ->whereNotNull('product_id')
            ->whereNotNull('external_url')
            ->with('product')
            ->orderBy('id');

        if ($onlyMissingVariants) {
            $query->whereHas('product', static function ($productQuery): void {
                $productQuery->whereDoesntHave('variants');
            });
        }

        $total = (clone $query)->count();
        $rows = $query->offset($offset)->limit(max(1, $limit))->get();

        $log = [];
        $processed = 0;
        $variantsCreated = 0;
        $offersRefreshed = 0;
        $errors = 0;

        foreach ($rows as $supplierProduct) {
            $processed++;
            $product = $supplierProduct->product;
            $url = trim((string) $supplierProduct->external_url);

            if (!$product) {
                $errors++;
                $log[] = 'SKIP: product #' . (int) $supplierProduct->product_id . ' not found';

                continue;
            }

            if ($url === '') {
                $errors++;
                $log[] = 'SKIP: empty URL for product #' . $product->id;

                continue;
            }

            try {
                $payload = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
                $offers = is_array($payload['offers'] ?? null) ? $payload['offers'] : [];

                if ($reparseFromUrl) {
                    if ($dryRun) {
                        $log[] = 'DRY: reparse ' . $url;
                        continue;
                    }

                    $parsed = $this->productParser->parseProductPage($url);
                    $offers = is_array($parsed['offers'] ?? null) ? $parsed['offers'] : [];
                    $payload['offers'] = $offers;
                    foreach (['characteristics', 'description', 'gallery_image_urls', 'brand', 'name', 'page_title'] as $key) {
                        if (array_key_exists($key, $parsed)) {
                            $payload[$key] = $parsed[$key];
                        }
                    }
                    $supplierProduct->payload = $payload;
                    $supplierProduct->save();
                    $offersRefreshed++;
                }

                if ($dryRun) {
                    $wouldCreate = 0;
                    foreach ($offers as $offer) {
                        if (!is_array($offer)) {
                            continue;
                        }
                        $parsedOffer = $this->offerVariantParser->parseVariant($offer);
                        if ($this->offerVariantParser->resolveVariantDefinition($parsedOffer)) {
                            $wouldCreate++;
                        }
                    }
                    $log[] = sprintf(
                        'DRY: %s | offers=%d | would_add_variants=%d',
                        $product->name,
                        count($offers),
                        $wouldCreate
                    );

                    continue;
                }

                $created = $this->syncProductVariantsFromOffers($product, $offers);
                $variantsCreated += $created;
                $log[] = sprintf(
                    'OK: %s | offers=%d | variants+%d | total=%d',
                    $product->name,
                    count($offers),
                    $created,
                    $product->variants()->count()
                );
            } catch (Throwable $e) {
                $errors++;
                $log[] = 'ERROR: ' . $url . ' -> ' . $e->getMessage();
            }
        }

        $nextOffset = $offset + $processed;

        return [
            'success' => $errors === 0,
            'message' => $dryRun
                ? 'Проверка вариантов Vanille (dry-run)'
                : 'Починка вариантов Vanille',
            'processed' => $processed,
            'variants_created' => $variantsCreated,
            'offers_refreshed' => $offersRefreshed,
            'errors' => $errors,
            'offset' => $offset,
            'next_offset' => $nextOffset,
            'total' => $total,
            'done' => $nextOffset >= $total,
            'log' => $log,
        ];
    }

    /**
     * @return array{
     *     success: bool,
     *     message: string,
     *     processed: int,
     *     updated: int,
     *     would_update: int,
     *     skipped: int,
     *     skipped_not_eligible: int,
     *     skipped_already_correct: int,
     *     skipped_stuck: int,
     *     reparsed: int,
     *     errors: int,
     *     offset: int,
     *     next_offset: int,
     *     total: int,
     *     done: bool,
     *     log: list<string>
     * }
     */
    public function repairVanilleProductNamesBatch(
        int $offset = 0,
        int $limit = 50,
        bool $onlySlugDerivedNames = true,
        bool $reparseFromUrl = false,
        bool $reparseIfStuck = false,
        bool $dryRun = false,
        bool $verbose = false,
    ): array {
        $supplier = Supplier::query()->where('code', 'vanille')->first();
        if (! $supplier) {
            return [
                'success' => false,
                'message' => 'Поставщик vanille не найден',
                'processed' => 0,
                'updated' => 0,
                'would_update' => 0,
                'skipped' => 0,
                'skipped_not_eligible' => 0,
                'skipped_already_correct' => 0,
                'skipped_stuck' => 0,
                'reparsed' => 0,
                'errors' => 0,
                'offset' => $offset,
                'next_offset' => $offset,
                'total' => 0,
                'done' => true,
                'log' => [],
            ];
        }

        $query = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->where('is_linked', true)
            ->whereNotNull('product_id')
            ->whereNotNull('external_url')
            ->with(['product.brand:id,name,slug'])
            ->orderBy('id');

        $total = (clone $query)->count();
        $rows = $query->offset($offset)->limit(max(1, $limit))->get();

        $log = [];
        $processed = 0;
        $updated = 0;
        $wouldUpdate = 0;
        $skipped = 0;
        $skippedNotEligible = 0;
        $skippedAlreadyCorrect = 0;
        $skippedStuck = 0;
        $reparsed = 0;
        $errors = 0;
        $reindexIds = [];

        foreach ($rows as $supplierProduct) {
            $processed++;
            $product = $supplierProduct->product;
            $url = trim((string) $supplierProduct->external_url);

            if (! $product) {
                $errors++;
                $log[] = 'ERROR: product #' . (int) $supplierProduct->product_id . ' not found';

                continue;
            }

            if ($url === '') {
                $errors++;
                $log[] = 'ERROR: empty URL for product #' . $product->id;

                continue;
            }

            try {
                $item = $this->supplierProductPayloadAsVanilleItem($supplierProduct, $url);
                $brandName = trim((string) ($item['brand'] ?? $product->brand?->name ?? ''));
                $brand = $product->brand;
                $resolved = $this->resolveImportedVanilleProductNames($item, $brand, $brandName);
                $shouldReparse = $reparseFromUrl;

                if (
                    $reparseIfStuck
                    && ! $shouldReparse
                    && $this->vanilleResolvedNameStillSlugDerived($resolved, $url, $product)
                ) {
                    $shouldReparse = true;
                }

                if ($shouldReparse) {
                    if ($dryRun) {
                        $log[] = 'DRY: reparse ' . $url;
                    } else {
                        $parsed = $this->productParser->parseProductPage($url);
                        foreach (['characteristics', 'description', 'gallery_image_urls', 'brand', 'name', 'page_title'] as $key) {
                            if (array_key_exists($key, $parsed)) {
                                $item[$key] = $parsed[$key];
                            }
                        }
                        $supplierProduct->payload = $item;
                        $supplierProduct->save();
                        $reparsed++;
                        $brandName = trim((string) ($item['brand'] ?? $brandName));
                        $resolved = $this->resolveImportedVanilleProductNames($item, $brand, $brandName);
                    }
                }

                $slugDerivedShort = ProductDisplayName::shortNameFromPathIdentityKey(
                    ProductDisplayName::vanilleProductPathIdentityKey($resolved['brand_slug_for_path'], $url),
                );

                if ($onlySlugDerivedNames) {
                    if (! $this->productNameLooksLikeLowercaseSlugName((string) $product->name, $slugDerivedShort)) {
                        $skipped++;
                        $skippedNotEligible++;
                        if ($verbose) {
                            $log[] = 'SKIP: not lowercase slug name | product #' . $product->id . ' | ' . $product->name;
                        }

                        continue;
                    }
                }

                if ($this->vanilleResolvedNameStillSlugDerived($resolved, $url, $product)) {
                    $skipped++;
                    $skippedStuck++;
                    if ($verbose) {
                        $log[] = 'SKIP: no better name in payload | product #' . $product->id . ' | ' . $url;
                    }

                    continue;
                }

                $currentName = trim((string) $product->name);
                $currentH1 = trim((string) $product->h1);
                $needsName = $resolved['short_name'] !== $currentName;
                $needsH1 = $resolved['display_name'] !== $currentH1;

                if (! $needsName && ! $needsH1) {
                    $skipped++;
                    $skippedAlreadyCorrect++;
                    if ($verbose) {
                        $log[] = 'SKIP: already correct | product #' . $product->id;
                    }

                    continue;
                }

                if ($dryRun) {
                    $wouldUpdate++;
                    $log[] = sprintf(
                        'DRY: product #%d | %s -> %s | h1: %s -> %s',
                        $product->id,
                        $currentName,
                        $resolved['short_name'],
                        $currentH1,
                        $resolved['display_name'],
                    );

                    continue;
                }

                $product->update([
                    'name' => $resolved['short_name'],
                    'h1' => $resolved['display_name'],
                ]);

                $externalName = trim((string) ($resolved['full_title'] ?? ''));
                if ($externalName !== '' && $externalName !== (string) $supplierProduct->external_name) {
                    $supplierProduct->update(['external_name' => $externalName]);
                }

                $updated++;
                $reindexIds[] = (int) $product->id;
                $log[] = sprintf(
                    'OK: product #%d | %s -> %s',
                    $product->id,
                    $currentName,
                    $resolved['short_name'],
                );
            } catch (Throwable $e) {
                $errors++;
                $log[] = 'ERROR: ' . $url . ' -> ' . $e->getMessage();
            }
        }

        if (
            $reindexIds !== []
            && ! $dryRun
            && (bool) config('services.catalog_search.enabled', false)
        ) {
            $indexer = app(ProductSearchIndexer::class);
            foreach (array_values(array_unique($reindexIds)) as $productId) {
                $indexer->queueProductSync($productId, true);
            }
        }

        $nextOffset = $offset + $processed;

        return [
            'success' => $errors === 0,
            'message' => $dryRun
                ? 'Проверка имён Vanille (dry-run)'
                : 'Починка имён Vanille',
            'processed' => $processed,
            'updated' => $updated,
            'would_update' => $wouldUpdate,
            'skipped' => $skipped,
            'skipped_not_eligible' => $skippedNotEligible,
            'skipped_already_correct' => $skippedAlreadyCorrect,
            'skipped_stuck' => $skippedStuck,
            'reparsed' => $reparsed,
            'errors' => $errors,
            'offset' => $offset,
            'next_offset' => $nextOffset,
            'total' => $total,
            'done' => $nextOffset >= $total,
            'log' => $log,
        ];
    }

    /**
     * @return array{
     *     success: bool,
     *     message: string,
     *     items_updated: int,
     *     errors: int,
     *     file_offset: int,
     *     next_file_offset: int,
     *     total_files: int,
     *     done: bool,
     *     files: list<string>,
     *     log: list<string>
     * }
     */
    public function refreshParsedJsonOffersBatch(
        int $fileOffset = 0,
        int $fileLimit = 1,
        bool $dryRun = false,
    ): array {
        $dir = $this->ensureVanilleProductsDir();
        $files = glob($dir . '/products_*.json') ?: [];
        sort($files);

        if ($files === []) {
            return [
                'success' => false,
                'message' => 'Файлы products_*.json не найдены',
                'items_updated' => 0,
                'errors' => 0,
                'file_offset' => $fileOffset,
                'next_file_offset' => $fileOffset,
                'total_files' => 0,
                'done' => true,
                'files' => [],
                'log' => [],
            ];
        }

        $chunk = array_slice($files, $fileOffset, max(1, $fileLimit));
        $log = [];
        $itemsUpdated = 0;
        $errors = 0;

        foreach ($chunk as $file) {
            $items = json_decode((string) file_get_contents($file), true);
            if (!is_array($items)) {
                $errors++;
                $log[] = 'ERROR: invalid JSON ' . basename($file);

                continue;
            }

            $fileChanged = false;

            foreach ($items as $index => $item) {
                if (!is_array($item)) {
                    continue;
                }

                $url = trim((string) ($item['url'] ?? ''));
                if ($url === '') {
                    continue;
                }

                try {
                    if ($dryRun) {
                        $log[] = 'DRY: ' . $url;

                        continue;
                    }

                    $parsed = $this->productParser->parseProductPage($url);
                    $items[$index]['offers'] = is_array($parsed['offers'] ?? null) ? $parsed['offers'] : [];
                    $fileChanged = true;
                    $itemsUpdated++;
                } catch (Throwable $e) {
                    $errors++;
                    $log[] = 'ERROR: ' . $url . ' -> ' . $e->getMessage();
                }
            }

            if ($fileChanged && !$dryRun) {
                file_put_contents(
                    $file,
                    json_encode($items, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
                );
            }

            $log[] = 'FILE: ' . basename($file);
        }

        $nextFileOffset = $fileOffset + count($chunk);

        return [
            'success' => $errors === 0,
            'message' => $dryRun
                ? 'Обновление offers в JSON (dry-run)'
                : 'Обновление offers в JSON',
            'items_updated' => $itemsUpdated,
            'errors' => $errors,
            'file_offset' => $fileOffset,
            'next_file_offset' => $nextFileOffset,
            'total_files' => count($files),
            'done' => $nextFileOffset >= count($files),
            'files' => array_map(static fn (string $path): string => basename($path), $chunk),
            'log' => $log,
        ];
    }

    protected function ensureVanilleImportDir(): string
    {
        $dir = storage_path('app/public/imports/vanille');

        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        return $dir;
    }

    protected function ensureVanilleProductsDir(): string
    {
        $dir = storage_path('app/public/imports/vanille/products');

        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        return $dir;
    }

    private function deduplicateLinks(array $links): array
    {
        $unique = [];

        foreach ($links as $link) {
            if (!is_array($link)) {
                continue;
            }

            $key = $this->buildLinkDedupKey($link);
            if ($key === '') {
                continue;
            }

            $unique[$key] = $link;
        }

        return array_values($unique);
    }

    private function deduplicateParsedItems(array $items): array
    {
        $unique = [];

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $url = trim((string) ($item['url'] ?? $item['source_url'] ?? ''));
            $key = $url !== '' ? $this->normalizeLinkUrl($url) : trim((string) ($item['name'] ?? ''));
            if ($key === '') {
                continue;
            }

            $unique[$key] = $item;
        }

        return array_values($unique);
    }

    private function persistImportJobProgressLog(
        int $jobId,
        bool $terminal,
        string $message,
        array $result,
        int $logTick,
    ): void {
        $errorSample = $this->extractParseErrorLinesFromResult($result);
        // В БД только старт первого шага, завершение и чанки с ошибками (без «каждые N» прогресса).
        $shouldWrite = $terminal || $logTick === 1 || $errorSample !== [];

        if (!$shouldWrite) {
            return;
        }

        VanilleImportJobLog::query()->create([
            'vanille_import_job_id' => $jobId,
            'level' => $errorSample !== [] ? 'warning' : 'info',
            'message' => $message,
            'context' => array_filter([
                'tick' => $logTick,
                'terminal' => $terminal,
                'sample_errors' => array_slice($errorSample, 0, 40),
                'summary' => $this->summarizeResultForLog($result),
                'final_log' => $terminal && is_array($result['final_log'] ?? null)
                    ? array_slice($result['final_log'], 0, 80)
                    : null,
            ]),
        ]);

        $this->persistGlobalAuditForVanilleJob($jobId, $terminal, $message, $errorSample, $logTick, $result);
    }

    private function persistGlobalAuditForVanilleJob(
        int $jobId,
        bool $terminal,
        string $message,
        array $errorSample,
        int $logTick,
        array $result,
    ): void {
        try {
            $audit = app(AuditLogService::class);
            $job = VanilleImportJob::query()->find($jobId);
            $context = array_filter([
                'tick' => $logTick,
                'job_type' => $job?->type,
                'summary' => $this->summarizeResultForLog($result),
                'sample_errors' => array_slice($errorSample, 0, 15),
            ]);

            if ($terminal) {
                $audit->record(
                    AuditLogService::ENTITY_VANILLE_IMPORT,
                    $jobId,
                    AuditLogService::ACTION_SUCCESS,
                    $message,
                    $context,
                );

                return;
            }

            if ($errorSample !== []) {
                $audit->record(
                    AuditLogService::ENTITY_VANILLE_IMPORT,
                    $jobId,
                    AuditLogService::ACTION_ERROR,
                    $message,
                    $context,
                );

                return;
            }

            // Прогресс без ошибок только в логах задачи (стартует через persistImportJobProgressLog при tick=1 и т. д.), без аудита «каждый шаг».
        } catch (Throwable) {
        }
    }

    /**
     * @return list<string>
     */
    private function extractParseErrorLinesFromResult(array $result): array
    {
        $lines = [];
        if (!empty($result['log']) && is_array($result['log'])) {
            foreach ($result['log'] as $line) {
                if (is_string($line) && str_starts_with(mb_strtoupper($line, 'UTF-8'), 'ERROR')) {
                    $lines[] = $line;
                }
            }
        }
        if (!empty($result['last_parse_batch']['log']) && is_array($result['last_parse_batch']['log'])) {
            foreach ($result['last_parse_batch']['log'] as $line) {
                if (is_string($line) && str_starts_with(mb_strtoupper($line, 'UTF-8'), 'ERROR')) {
                    $lines[] = $line;
                }
            }
        }

        return array_values(array_unique($lines));
    }

    private function summarizeResultForLog(array $result): array
    {
        $keys = [
            'phase',
            'pipeline',
            'processed_brands',
            'total_brands',
            'processed_links',
            'total_links',
            'next_offset',
            'count',
            'errors',
            'path',
            'added_links_count',
            'parsed_products_count',
        ];
        $out = [];
        foreach ($keys as $key) {
            if (array_key_exists($key, $result)) {
                $out[$key] = $result[$key];
            }
        }

        return $out;
    }

    private function buildLinkDedupKey(array $link): string
    {
        $url = trim((string) ($link['url'] ?? ''));
        if ($url !== '') {
            return $this->normalizeLinkUrl($url);
        }

        $slug = trim((string) ($link['slug'] ?? ''));
        if ($slug !== '') {
            return mb_strtolower($slug);
        }

        return '';
    }

    private function parsedUrlsManifestPath(): string
    {
        return $this->ensureVanilleImportDir() . '/parsed_urls.json';
    }

    private function parseErrorsManifestPath(): string
    {
        return $this->ensureVanilleImportDir() . '/parse_errors.json';
    }

    /**
     * @return array<string, array{message: string, last_attempt_at: string}>
     */
    private function loadParseErrorsMap(): array
    {
        $path = $this->parseErrorsManifestPath();
        if (!is_file($path)) {
            return [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        $errors = is_array($decoded['errors'] ?? null) ? $decoded['errors'] : [];
        $map = [];

        foreach ($errors as $row) {
            if (!is_array($row)) {
                continue;
            }
            $url = trim((string) ($row['url'] ?? ''));
            if ($url === '') {
                continue;
            }
            $key = $this->normalizeLinkUrl($url);
            $map[$key] = [
                'url' => $url,
                'message' => trim((string) ($row['message'] ?? '')),
                'last_attempt_at' => (string) ($row['last_attempt_at'] ?? ''),
            ];
        }

        return $map;
    }

    private function persistParseErrorsMap(array $map): void
    {
        $rows = array_values($map);
        usort($rows, static fn (array $a, array $b): int => strcmp((string) ($a['url'] ?? ''), (string) ($b['url'] ?? '')));

        file_put_contents(
            $this->parseErrorsManifestPath(),
            json_encode(['errors' => $rows], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );
    }

    private function recordParseError(string $url, string $message): void
    {
        $key = $this->normalizeLinkUrl($url);
        if ($key === '') {
            return;
        }

        $map = $this->loadParseErrorsMap();
        $map[$key] = [
            'url' => $url,
            'message' => $message,
            'last_attempt_at' => now()->toIso8601String(),
        ];
        $this->persistParseErrorsMap($map);
    }

    private function removeParseError(string $url): void
    {
        $key = $this->normalizeLinkUrl($url);
        if ($key === '') {
            return;
        }

        $map = $this->loadParseErrorsMap();
        if (!isset($map[$key])) {
            return;
        }

        unset($map[$key]);
        $this->persistParseErrorsMap($map);
    }

    /**
     * Файл ссылок только для URL из parse_errors.json (режим errors_only).
     */
    private function buildParseErrorsLinksFile(): string
    {
        $map = $this->loadParseErrorsMap();
        if ($map === []) {
            return '';
        }

        $links = [];
        foreach ($map as $row) {
            $url = trim((string) ($row['url'] ?? ''));
            if ($url === '') {
                continue;
            }
            $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
            $slug = trim(basename($path));
            $links[] = [
                'url' => $url,
                'slug' => $slug !== '' ? $slug : null,
            ];
        }

        $path = $this->ensureVanilleImportDir() . '/product_links_errors_only.json';
        file_put_contents($path, json_encode($links, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        return $path;
    }

    public function getParseErrorsSummary(): array
    {
        $map = $this->loadParseErrorsMap();

        return [
            'path' => $this->parseErrorsManifestPath(),
            'count' => count($map),
            'sample' => array_slice(array_values($map), 0, 20),
        ];
    }

    private function newOnlyProductLinksPath(): string
    {
        return $this->ensureVanilleImportDir() . '/product_links_new_only.json';
    }

    /**
     * @return array<string, bool> normalized URL => true
     */
    private function loadParsedUrlsSet(): array
    {
        $path = $this->parsedUrlsManifestPath();
        if (!file_exists($path)) {
            return [];
        }

        $decoded = json_decode(file_get_contents($path), true);
        $urls = is_array($decoded['urls'] ?? null) ? $decoded['urls'] : [];
        $set = [];
        foreach ($urls as $u) {
            $n = $this->normalizeLinkUrl((string) $u);
            if ($n !== '') {
                $set[$n] = true;
            }
        }

        return $set;
    }

    private function appendUrlsToParsedManifest(array $urls): void
    {
        $normalized = [];
        foreach ($urls as $u) {
            $n = $this->normalizeLinkUrl((string) $u);
            if ($n !== '') {
                $normalized[$n] = true;
            }
        }

        if ($normalized === []) {
            return;
        }

        $merged = $this->loadParsedUrlsSet();
        foreach (array_keys($normalized) as $n) {
            $merged[$n] = true;
        }

        file_put_contents(
            $this->parsedUrlsManifestPath(),
            json_encode(['urls' => array_keys($merged)], JSON_UNESCAPED_UNICODE)
        );
    }

    /**
     * Нормализованные URL товаров Vanille, которые уже привязаны к каталогу (импортированы).
     * Используется для режима «только новые»: URL не должен исчезать из очереди после одного лишь парсинга без импорта.
     *
     * @return array<string, bool>
     */
    private function loadImportedVanilleSupplierProductUrlKeys(): array
    {
        $supplier = Supplier::query()->where('code', 'vanille')->first();
        if (!$supplier) {
            return [];
        }

        $set = [];
        SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->whereNotNull('product_id')
            ->whereNotNull('external_url')
            ->orderBy('id')
            ->select(['id', 'external_url'])
            ->chunkById(2000, function ($rows) use (&$set): void {
                foreach ($rows as $row) {
                    $n = $this->normalizeLinkUrl((string) $row->external_url);
                    if ($n !== '') {
                        $set[$n] = true;
                    }
                }
            });

        return $set;
    }

    /**
     * Спарсить одну карточку и сохранить в отдельный JSON (не перезаписывает products_001.json и т.д.).
     *
     * @return array{success: bool, file: string, file_path: string, name: string, offers_count: int, log: list<string>, message?: string}
     */
    public function parseSingleProductUrlToJsonFile(string $rawUrl): array
    {
        $url = $this->normalizeVanilleProductInputToUrl($rawUrl);

        try {
            $item = $this->productParser->parseProductPage($url);
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'file' => '',
                'file_path' => '',
                'name' => '',
                'offers_count' => 0,
                'log' => ['ERROR: ' . $url . ' -> ' . $e->getMessage()],
                'message' => $e->getMessage(),
            ];
        }

        $dir = $this->ensureVanilleProductsDir();
        $basename = 'product_single_' . now()->format('Y-m-d_His') . '_' . substr(sha1($url), 0, 10) . '.json';
        $filePath = $dir . '/' . $basename;

        file_put_contents(
            $filePath,
            json_encode([$item], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );
        $this->appendUrlsToParsedManifest([$url]);

        $offers = is_array($item['offers'] ?? null) ? $item['offers'] : [];

        return [
            'success' => true,
            'file' => $basename,
            'file_path' => $filePath,
            'name' => (string) ($item['name'] ?? ''),
            'offers_count' => count($offers),
            'log' => ['OK: ' . $url],
        ];
    }

    private function normalizeVanilleProductInputToUrl(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            throw new \InvalidArgumentException('Пустой URL');
        }

        if (!preg_match('#^https?://#i', $raw)) {
            $raw = 'https://vanille.by/' . ltrim($raw, '/');
        }

        $parts = parse_url($raw);
        $host = isset($parts['host']) ? mb_strtolower((string) $parts['host']) : '';
        if (!in_array($host, ['vanille.by', 'www.vanille.by'], true)) {
            throw new \InvalidArgumentException('Разрешены только URL с домена vanille.by');
        }

        $path = isset($parts['path']) ? '/' . trim((string) $parts['path'], '/') : '';
        if ($path === '/' || $path === '') {
            throw new \InvalidArgumentException('Укажите страницу товара (путь после домена)');
        }

        return 'https://vanille.by' . $path;
    }

    /**
     * Локальный product_id связанного товара Vanille по URL/slug страницы (после импорта).
     */
    public function resolveLinkedVanilleProductId(string $rawUrl): ?int
    {
        try {
            $canonicalUrl = $this->normalizeVanilleProductInputToUrl($rawUrl);
        } catch (\Throwable) {
            return null;
        }

        return $this->resolveLinkedVanilleProductIdByCanonicalUrl($canonicalUrl);
    }

    public function resolveLinkedVanilleProductIdByProductId(int $productId): ?int
    {
        if ($productId <= 0) {
            return null;
        }

        $supplierId = (int) Supplier::query()->where('code', 'vanille')->value('id');
        if ($supplierId <= 0) {
            return null;
        }

        $linkedId = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->where('product_id', $productId)
            ->where('is_linked', true)
            ->value('product_id');

        return $linkedId !== null ? (int) $linkedId : null;
    }

    private function resolveLinkedVanilleProductIdByCanonicalUrl(string $canonicalUrl): ?int
    {
        $key = $this->normalizeLinkUrl($canonicalUrl);
        if ($key === '') {
            return null;
        }

        $pathSlug = $this->vanilleUrlPathSlug($canonicalUrl);

        $supplierId = (int) Supplier::query()->where('code', 'vanille')->value('id');
        if ($supplierId <= 0) {
            return null;
        }

        $rows = SupplierProduct::query()
            ->where('supplier_id', $supplierId)
            ->whereNotNull('product_id')
            ->where('is_linked', true)
            ->whereNotNull('external_url')
            ->get(['product_id', 'external_url']);

        foreach ($rows as $row) {
            $externalUrl = (string) $row->external_url;
            if ($this->normalizeLinkUrl($externalUrl) === $key) {
                return (int) $row->product_id;
            }
            if ($pathSlug !== '' && $this->vanilleUrlPathSlug($externalUrl) === $pathSlug) {
                return (int) $row->product_id;
            }
        }

        return null;
    }

    /**
     * @return array{path: string, source_total: int, filtered_total: int, skipped_count: int}
     */
    private function buildNewOnlyProductLinksFile(): array
    {
        $filteredPath = $this->newOnlyProductLinksPath();
        if (is_file($filteredPath)) {
            @unlink($filteredPath);
        }

        $skip = $this->loadImportedVanilleSupplierProductUrlKeys();
        foreach (array_keys($this->loadParsedUrlsSet()) as $parsedUrlKey) {
            $skip[$parsedUrlKey] = true;
        }

        $mainPath = $this->ensureVanilleImportDir() . '/product_links.json';
        if (!file_exists($mainPath)) {
            file_put_contents($filteredPath, '[]');

            return [
                'path' => $filteredPath,
                'source_total' => 0,
                'filtered_total' => 0,
                'skipped_count' => 0,
            ];
        }

        $links = json_decode(file_get_contents($mainPath), true);
        if (!is_array($links)) {
            throw new \RuntimeException('Файл product_links.json повреждён');
        }

        $links = $this->deduplicateLinks($links);
        $sourceTotal = count($links);
        $filtered = [];
        foreach ($links as $link) {
            if (!is_array($link)) {
                continue;
            }

            $url = trim((string) ($link['url'] ?? ''));
            if ($url === '') {
                continue;
            }

            $key = $this->normalizeLinkUrl($url);
            if ($key === '' || isset($skip[$key])) {
                continue;
            }

            $filtered[] = $link;
        }

        file_put_contents(
            $filteredPath,
            json_encode(array_values($filtered), JSON_UNESCAPED_UNICODE)
        );

        $filteredTotal = count($filtered);
        return [
            'path' => $filteredPath,
            'source_total' => $sourceTotal,
            'filtered_total' => $filteredTotal,
            'skipped_count' => max(0, $sourceTotal - $filteredTotal),
        ];
    }

    private function normalizeLinkUrl(string $url): string
    {
        $normalized = preg_replace('/[?#].*$/', '', trim($url)) ?? '';
        if ($normalized === '') {
            return '';
        }

        if ($normalized !== '/' && str_ends_with($normalized, '/')) {
            $normalized = rtrim($normalized, '/');
        }

        $normalized = preg_replace('#^https?://www\.vanille\.by#i', 'https://vanille.by', $normalized) ?? $normalized;
        $normalized = preg_replace('#^https?://vanille\.by#i', 'https://vanille.by', $normalized) ?? $normalized;

        return mb_strtolower($normalized);
    }

    private function vanilleUrlPathSlug(string $url): string
    {
        $path = trim((string) parse_url($url, PHP_URL_PATH), '/');

        return $path !== '' ? mb_strtolower($path, 'UTF-8') : '';
    }

    /**
     * @return array<string, Brand>
     */
    private function buildBrandEquivalentLookup(): array
    {
        $map = [];
        foreach (Brand::query()->get(['id', 'name', 'slug']) as $brand) {
            $key = ProductDisplayName::brandEquivalentKey((string) $brand->name);
            if ($key === '' || isset($map[$key])) {
                continue;
            }
            $map[$key] = $brand;
        }

        return $map;
    }

    /**
     * @param  array<string, mixed>|null  $catalogBrand
     * @param  array<string, bool>  $brandSlugSet
     * @param  array<string, bool>  $productSlugSet
     * @param  array<string, Brand>  $brandByEquivalentKey
     */
    private function resolveBrandForVanilleImport(
        string $brandName,
        ?array $catalogBrand,
        string $preferredSlug,
        array &$brandSlugSet,
        array &$productSlugSet,
        array &$brandByEquivalentKey,
    ): Brand {
        $preferredSlug = $this->resolveUniqueSlugInMemory($preferredSlug, $brandSlugSet, $productSlugSet);
        $preferredKey = mb_strtolower($preferredSlug);

        $existingBySlug = Brand::query()->where('slug', $preferredSlug)->first();
        if ($existingBySlug !== null) {
            $brandSlugSet[$preferredKey] = true;
            $eqKey = ProductDisplayName::brandEquivalentKey($brandName);
            if ($eqKey !== '') {
                $brandByEquivalentKey[$eqKey] = $existingBySlug;
            }

            return $existingBySlug;
        }

        $eqKey = ProductDisplayName::brandEquivalentKey($brandName);
        if ($eqKey !== '' && isset($brandByEquivalentKey[$eqKey])) {
            $brand = $brandByEquivalentKey[$eqKey];
            $brandSlugSet[mb_strtolower((string) $brand->slug)] = true;

            return $brand;
        }

        $brand = Brand::query()->create([
            'slug' => $preferredSlug,
            'name' => trim((string) ($catalogBrand['name'] ?? $brandName)),
            'seo_title' => $brandName,
            'seo_description' => null,
            'description' => null,
            'is_active' => true,
        ]);

        $brandSlugSet[$preferredKey] = true;
        if ($eqKey !== '') {
            $brandByEquivalentKey[$eqKey] = $brand;
        }

        return $brand;
    }

    private function findExistingProductForVanilleImport(
        Supplier $supplier,
        ?Brand $brand,
        string $slug,
        string $pathIdentityKey,
        string $vanilleUrl,
    ): ?Product {
        if ($vanilleUrl !== '') {
            $linkedId = $this->resolveLinkedVanilleProductId($vanilleUrl);
            if ($linkedId !== null && $linkedId > 0) {
                $linked = Product::query()->find($linkedId);
                if ($linked !== null && $this->vanilleProductMatchesUrlPath($linked, $vanilleUrl)) {
                    return $linked;
                }
            }

            $byExactPath = $this->findExistingProductByExactVanillePath($supplier, $brand, $vanilleUrl);
            if ($byExactPath !== null) {
                return $byExactPath;
            }
        }

        $bySlug = Product::query()->where('slug', $slug)->first();
        if ($bySlug !== null) {
            return $bySlug;
        }

        return null;
    }

    private function vanilleProductMatchesUrlPath(Product $product, string $vanilleUrl): bool
    {
        try {
            $canonicalUrl = $this->normalizeVanilleProductInputToUrl($vanilleUrl);
        } catch (\Throwable) {
            return false;
        }

        $urlPathSlug = $this->vanilleUrlPathSlug($canonicalUrl);
        if ($urlPathSlug === '') {
            return false;
        }

        return mb_strtolower((string) $product->slug) === $urlPathSlug;
    }

    private function findExistingProductByExactVanillePath(
        Supplier $supplier,
        ?Brand $brand,
        string $vanilleUrl,
    ): ?Product {
        try {
            $canonicalUrl = $this->normalizeVanilleProductInputToUrl($vanilleUrl);
        } catch (\Throwable) {
            return null;
        }

        $pathSlug = $this->vanilleUrlPathSlug($canonicalUrl);
        if ($pathSlug === '') {
            return null;
        }

        $rows = SupplierProduct::query()
            ->where('supplier_id', $supplier->id)
            ->whereNotNull('product_id')
            ->whereNotNull('external_url')
            ->get(['product_id', 'external_url']);

        foreach ($rows as $row) {
            if ($this->vanilleUrlPathSlug((string) $row->external_url) !== $pathSlug) {
                continue;
            }

            $product = Product::query()->find((int) $row->product_id);
            if ($product !== null && $this->vanilleProductMatchesUrlPath($product, $vanilleUrl)) {
                return $product;
            }
        }

        if ($brand === null) {
            return null;
        }

        return Product::query()
            ->where('brand_id', (int) $brand->id)
            ->whereRaw('LOWER(slug) = ?', [$pathSlug])
            ->first();
    }

    private function resolveUniqueSlugInMemory(string $baseSlug, array $primarySet, array $foreignSet): string
    {
        $candidate = $baseSlug;
        $index = 2;

        while (isset($foreignSet[mb_strtolower($candidate)]) && !isset($primarySet[mb_strtolower($candidate)])) {
            $candidate = "{$baseSlug}-{$index}";
            $index++;
        }

        return $candidate;
    }

    /**
     * @param  array<string, mixed>|null  $catalogBrand
     * @return array{short_name: string, display_name: string, full_title: string, brand_slug_for_path: string}
     */
    private function resolveImportedVanilleProductNames(
        array $item,
        ?Brand $brand,
        string $brandName,
        ?array $catalogBrand = null,
    ): array {
        $brandName = trim($brandName);
        if ($catalogBrand === null && $brandName !== '') {
            $catalogBrand = VanilleBrandParser::findCatalogBrandRow($brandName);
        }

        $brandSlugForPath = (string) ($brand?->slug ?? ($catalogBrand['slug'] ?? VanilleHelper::slugify($brandName)));
        $vanilleUrl = trim((string) ($item['url'] ?? ''));
        $fullTitle = $this->resolveProductName($item);
        $productShortName = ProductDisplayName::resolveCanonicalShortName(
            $brandName,
            $brandSlugForPath,
            $fullTitle,
            $vanilleUrl,
            $this->resolveVanilleProductCasingSources($item),
        );

        if ($productShortName === '') {
            $urlTail = trim((string) parse_url($vanilleUrl, PHP_URL_PATH), '/');
            $productShortName = $urlTail !== '' ? $urlTail : $fullTitle;
        }

        return [
            'short_name' => $productShortName,
            'display_name' => ProductDisplayName::format($brand?->name ?? $brandName, $productShortName),
            'full_title' => $fullTitle,
            'brand_slug_for_path' => $brandSlugForPath,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function supplierProductPayloadAsVanilleItem(SupplierProduct $supplierProduct, string $url): array
    {
        $item = is_array($supplierProduct->payload) ? $supplierProduct->payload : [];
        $item['url'] = $url;

        return $item;
    }

    /**
     * @param  array{short_name: string, display_name: string, full_title: string, brand_slug_for_path: string}  $resolved
     */
    private function vanilleResolvedNameStillSlugDerived(array $resolved, string $url, Product $product): bool
    {
        $slugDerivedShort = ProductDisplayName::shortNameFromPathIdentityKey(
            ProductDisplayName::vanilleProductPathIdentityKey($resolved['brand_slug_for_path'], $url),
        );

        if ($slugDerivedShort === '') {
            return false;
        }

        return ProductDisplayName::nameWordsEquivalent($resolved['short_name'], $slugDerivedShort)
            && $resolved['short_name'] === $slugDerivedShort
            && ProductDisplayName::nameWordsEquivalent((string) $product->name, $slugDerivedShort);
    }

    private function productNameLooksLikeLowercaseSlugName(string $currentName, string $slugDerivedShort): bool
    {
        $currentName = trim($currentName);
        $slugDerivedShort = trim($slugDerivedShort);

        if ($currentName === '' || $slugDerivedShort === '') {
            return false;
        }

        if ($currentName !== mb_strtolower($currentName, 'UTF-8')) {
            return false;
        }

        return ProductDisplayName::nameWordsEquivalent($currentName, $slugDerivedShort);
    }

    private function resolveProductName(array $item): string
    {
        $name = trim((string) ($item['name'] ?? ''));
        if ($name !== '') {
            return $name;
        }

        $title = trim((string) ($item['page_title'] ?? ''));
        if ($title !== '') {
            return $title;
        }

        $characteristics = is_array($item['characteristics'] ?? null) ? $item['characteristics'] : [];
        $aromat = trim((string) ($characteristics['Аромат'] ?? $characteristics['аромат'] ?? ''));
        if ($aromat !== '') {
            return $aromat;
        }

        $urlPath = trim((string) parse_url((string) ($item['url'] ?? ''), PHP_URL_PATH), '/');
        $tail = $urlPath !== '' ? basename($urlPath) : '';
        if ($tail !== '') {
            return trim(str_replace(['-', '_'], ' ', $tail));
        }

        return 'Unknown product';
    }

    /**
     * @return list<string>
     */
    private function resolveVanilleProductCasingSources(array $item): array
    {
        $characteristics = is_array($item['characteristics'] ?? null) ? $item['characteristics'] : [];

        return array_values(array_unique(array_filter([
            trim((string) ($item['name'] ?? '')),
            trim((string) ($item['page_title'] ?? '')),
            trim((string) ($characteristics['Аромат'] ?? $characteristics['аромат'] ?? '')),
        ], static fn (string $value): bool => $value !== '')));
    }

    private function rewriteDescriptionForNewProductIfPossible(int $productId): void
    {
        try {
            $product = Product::query()->find($productId);
            if (! $product) {
                return;
            }
            $rewriter = app(ProductDescriptionRewriter::class);
            $res = $rewriter->rewriteProduct($product);
            if (($res['ok'] ?? false) && isset($res['description'])) {
                $product->update([
                    'description' => $res['description'],
                    'description_rewritten_at' => now(),
                ]);
            }
        } catch (Throwable) {
        }
    }

    /**
     * @return array{done: bool, progress: int, message: string, result: array<string, mixed>}
     */
    public function runVanilleCatalogImagesJob(VanilleImportJob $job): array
    {
        $result = is_array($job->result) ? $job->result : [];
        $state = is_array($result['state'] ?? null) ? $result['state'] : [];
        $brandOffset = (int) ($state['brand_offset'] ?? 0);
        $batch = $this->mediaImportService()->runCatalogImagesBatch($brandOffset, 1);

        return [
            'done' => (bool) ($batch['done'] ?? true),
            'progress' => (int) ($batch['progress'] ?? 100),
            'message' => (string) ($batch['message'] ?? ''),
            'result' => is_array($batch['result'] ?? null) ? $batch['result'] : [],
        ];
    }

    /**
     * @return array{done: bool, progress: int, message: string, result: array<string, mixed>}
     */
    public function runVanilleProductImagesJob(VanilleImportJob $job): array
    {
        $result = is_array($job->result) ? $job->result : [];
        $state = is_array($result['state'] ?? null) ? $result['state'] : [];
        $offset = (int) ($state['offset'] ?? 0);
        $batch = $this->mediaImportService()->runProductGalleryBatch($offset, 3);

        return [
            'done' => (bool) ($batch['done'] ?? true),
            'progress' => (int) ($batch['progress'] ?? 100),
            'message' => (string) ($batch['message'] ?? ''),
            'result' => is_array($batch['result'] ?? null) ? $batch['result'] : [],
        ];
    }

    /**
     * @return array{done: bool, progress: int, message: string, result: array<string, mixed>}
     */
    public function runVanilleRewriteDescriptionsJob(VanilleImportJob $job): array
    {
        $result = is_array($job->result) ? $job->result : [];
        $state = is_array($result['state'] ?? null) ? $result['state'] : [];
        $offset = (int) ($state['offset'] ?? 0);
        $batch = $this->mediaImportService()->runDescriptionRewriteBatch($offset, 2);

        return [
            'done' => (bool) ($batch['done'] ?? true),
            'progress' => (int) ($batch['progress'] ?? 100),
            'message' => (string) ($batch['message'] ?? ''),
            'result' => is_array($batch['result'] ?? null) ? $batch['result'] : [],
        ];
    }

    /**
     * @return array{done: bool, progress: int, message: string, result: array<string, mixed>}
     */
    public function runVanilleRetryFailedJob(VanilleImportJob $job): array
    {
        $result = is_array($job->result) ? $job->result : [];
        $state = is_array($result['state'] ?? null) ? $result['state'] : [];
        $taskType = (string) ($state['task_type'] ?? ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES);
        $onlyIds = isset($state['product_ids']) && is_array($state['product_ids'])
            ? array_values(array_filter(array_map('intval', $state['product_ids'])))
            : null;

        $queue = app(ImportRetryQueue::class);

        if ($onlyIds !== null && $onlyIds !== []) {
            $batch = $this->mediaImportService()->runRetryFailedBatch($taskType, 0, count($onlyIds), $onlyIds);

            return [
                'done' => true,
                'progress' => 100,
                'message' => (string) ($batch['message'] ?? 'Retry'),
                'result' => is_array($batch['result'] ?? null) ? $batch['result'] : [],
            ];
        }

        $ids = $queue->pendingProductIds($taskType, 5, 0);
        if ($ids === []) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => 'Retry: очередь пуста',
                'result' => ['task_type' => $taskType, 'state' => $state],
            ];
        }

        $batch = $this->mediaImportService()->runRetryFailedBatch($taskType, 0, 5, $ids);
        $remaining = $queue->pendingCount($taskType);
        $done = $remaining === 0;

        return [
            'done' => $done,
            'progress' => $done ? 100 : max(10, 90 - min(80, $remaining * 2)),
            'message' => (string) ($batch['message'] ?? 'Retry').' (осталось: '.$remaining.')',
            'result' => array_merge(
                is_array($batch['result'] ?? null) ? $batch['result'] : [],
                ['state' => ['task_type' => $taskType], 'pending_remaining' => $remaining],
            ),
        ];
    }

    public function enqueueParseCatalogImages(): VanilleImportJob
    {
        PublicStorageWriteGuard::assertProductImagesWritable();

        return $this->enqueueJobWithInitialResult(self::JOB_TYPE_PARSE_CATALOG_IMAGES, [
            'state' => ['brand_offset' => 0],
        ]);
    }

    public function enqueueParseProductImages(): VanilleImportJob
    {
        PublicStorageWriteGuard::assertProductImagesWritable();

        return $this->enqueueJobWithInitialResult(self::JOB_TYPE_PARSE_PRODUCT_IMAGES, [
            'state' => ['offset' => 0],
        ]);
    }

    public function enqueueRewriteDescriptions(): VanilleImportJob
    {
        return $this->enqueueJobWithInitialResult(self::JOB_TYPE_REWRITE_DESCRIPTIONS, [
            'state' => ['offset' => 0],
        ]);
    }

    /**
     * @param  list<int>|null  $productIds
     */
    public function enqueueRetryFailed(string $taskType, ?array $productIds = null): VanilleImportJob
    {
        if (in_array($taskType, [
            ImportRetryItem::TASK_VANILLE_CATALOG_IMAGES,
            ImportRetryItem::TASK_VANILLE_PRODUCT_IMAGES,
        ], true)) {
            PublicStorageWriteGuard::assertProductImagesWritable();
        }

        $state = ['task_type' => $taskType];
        if ($productIds !== null && $productIds !== []) {
            $state['product_ids'] = array_values(array_map('intval', $productIds));
        }

        return $this->enqueueJobWithInitialResult(self::JOB_TYPE_RETRY_FAILED, [
            'state' => $state,
        ]);
    }

    /**
     * @param  array<string, mixed>  $initialResult
     */
    private function enqueueJobWithInitialResult(string $type, array $initialResult): VanilleImportJob
    {
        if (VanilleImportJob::findLatestActive()) {
            throw new \RuntimeException('Уже выполняется задача парсинга Vanille. Дождитесь завершения.');
        }

        $this->pruneOrphanQueuePayloads();

        $job = VanilleImportJob::query()->create([
            'type' => $type,
            'status' => VanilleImportJob::STATUS_PENDING,
            'progress' => 0,
            'message' => $this->queuedJobExecutor->label($type).': в очереди',
            'result' => $initialResult,
        ]);

        VanilleImportJobLog::query()->create([
            'vanille_import_job_id' => $job->id,
            'level' => 'info',
            'message' => $this->queuedJobExecutor->label($type).': задача поставлена в очередь',
            'context' => [
                'type' => $type,
            ],
        ]);

        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_VANILLE_IMPORT,
                $job->id,
                AuditLogService::ACTION_CREATED,
                $this->queuedJobExecutor->label($type).': задача поставлена в очередь',
                ['job_type' => $type],
            );
        } catch (Throwable) {
        }

        $this->dispatchRunJob($job);

        return $job->fresh();
    }

    private function mediaImportService(): VanilleMediaImportService
    {
        return app(VanilleMediaImportService::class);
    }

}
