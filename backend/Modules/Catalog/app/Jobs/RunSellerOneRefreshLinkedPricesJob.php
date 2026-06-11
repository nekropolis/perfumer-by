<?php

namespace Modules\Catalog\Jobs;

use App\Services\AuditLogService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Modules\Communications\Services\Notifications\ImportTelegramNotificationService;
use Modules\ImportExport\Services\Vanille\SupplierPriceImportService;
use Throwable;

class RunSellerOneRefreshLinkedPricesJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * При занятости lock (~45 сек между попытками) нужен запас на час параллельного парсинга:
     * 90 попыток ≈ 67 мин между первой и последней отложенной попыткой.
     */
    public int $tries = 90;

    public int $timeout = 3600;

    public bool $failOnTimeout = true;

    public function __construct(
        public string $jobId,
        public string $storedFilePath,
        public string $originalFileName = '',
    ) {
    }

    public function handle(SupplierPriceImportService $service, AuditLogService $audit): void
    {
        $cacheKey = self::cacheKey($this->jobId);

        $disk = null;
        foreach (['local', 'public'] as $candidate) {
            if (Storage::disk($candidate)->exists($this->storedFilePath)) {
                $disk = $candidate;
                break;
            }
        }

        if ($disk === null) {
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => 'refresh_linked',
                'status' => 'failed',
                'message' => 'Файл для обновления цен не найден',
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));
            self::clearActiveJobIfMatches($this->jobId);

            return;
        }

        $absolutePath = Storage::disk($disk)->path($this->storedFilePath);

        try {
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => 'refresh_linked',
                'status' => 'running',
                'processed' => 0,
                'total_linked' => 0,
                'updated' => 0,
                'skipped' => 0,
                'price_history_rows' => 0,
                'message' => 'Чтение прайса…',
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            $result = $service->refreshLinkedPricesFromAbsolutePath(
                $absolutePath,
                function (array $progress) use ($cacheKey): void {
                    Cache::put($cacheKey, array_merge(
                        [
                            'job_id' => $this->jobId,
                            'job_type' => 'refresh_linked',
                            'status' => 'running',
                            'updated_at' => now()->toDateTimeString(),
                        ],
                        $progress
                    ), now()->addHours(24));
                }
            );

            try {
                $audit->record(
                    AuditLogService::ENTITY_VANILLE_IMPORT,
                    null,
                    AuditLogService::ACTION_UPDATED,
                    'Seller One: обновлены цены связанных товаров из прайса (очередь)',
                    [
                        'operation' => 'seller_one_refresh_linked_prices',
                        'file_name' => $this->originalFileName,
                        'updated' => (int) ($result['updated'] ?? 0),
                        'skipped' => (int) ($result['skipped'] ?? 0),
                        'price_history_rows' => (int) ($result['price_history_rows'] ?? 0),
                        'missing_codes' => (int) ($result['missing_codes'] ?? 0),
                        'deactivated_offers' => (int) ($result['deactivated_offers'] ?? 0),
                        'deactivated_variants' => (int) ($result['deactivated_variants'] ?? 0),
                        'cleared_supplier_shelf_variants' => (int) ($result['cleared_supplier_shelf_variants'] ?? 0),
                        'codes_in_price' => (int) ($result['codes_in_price'] ?? 0),
                        'linked_products' => (int) ($result['linked_products'] ?? 0),
                        'price_changed' => (int) ($result['price_changed'] ?? 0),
                        'became_out_of_stock' => (int) ($result['became_out_of_stock'] ?? 0),
                        'became_in_stock' => (int) ($result['became_in_stock'] ?? 0),
                    ]
                );
            } catch (Throwable) {
            }

            $linked = (int) ($result['linked_products'] ?? 0);
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => 'refresh_linked',
                'status' => 'completed',
                'processed' => $linked,
                'total_linked' => $linked,
                'updated' => (int) ($result['updated'] ?? 0),
                'skipped' => (int) ($result['skipped'] ?? 0),
                'price_history_rows' => (int) ($result['price_history_rows'] ?? 0),
                'price_changed' => (int) ($result['price_changed'] ?? 0),
                'became_out_of_stock' => (int) ($result['became_out_of_stock'] ?? 0),
                'became_in_stock' => (int) ($result['became_in_stock'] ?? 0),
                'missing_codes' => (int) ($result['missing_codes'] ?? 0),
                'deactivated_offers' => (int) ($result['deactivated_offers'] ?? 0),
                'deactivated_variants' => (int) ($result['deactivated_variants'] ?? 0),
                'cleared_supplier_shelf_variants' => (int) ($result['cleared_supplier_shelf_variants'] ?? 0),
                'codes_in_price' => (int) ($result['codes_in_price'] ?? 0),
                'linked_products' => $linked,
                'message' => (string) ($result['message'] ?? 'Цены связанных товаров обновлены'),
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            try {
                $service->recordLastPriceApply($this->originalFileName !== '' ? $this->originalFileName : null);
            } catch (Throwable) {
            }

            try {
                app(ImportTelegramNotificationService::class)->notifySellerOneRefreshFinished($this->jobId, [
                    'status' => 'completed',
                    'total_linked' => $linked,
                    'updated' => (int) ($result['updated'] ?? 0),
                    'skipped' => (int) ($result['skipped'] ?? 0),
                    'price_changed' => (int) ($result['price_changed'] ?? 0),
                    'became_out_of_stock' => (int) ($result['became_out_of_stock'] ?? 0),
                    'became_in_stock' => (int) ($result['became_in_stock'] ?? 0),
                    'message' => (string) ($result['message'] ?? 'Цены связанных товаров обновлены'),
                ]);
            } catch (Throwable) {
            }
        } catch (Throwable $e) {
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => 'refresh_linked',
                'status' => 'failed',
                'message' => $e->getMessage(),
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            try {
                app(ImportTelegramNotificationService::class)->notifySellerOneRefreshFinished($this->jobId, [
                    'status' => 'failed',
                    'message' => $e->getMessage(),
                ]);
            } catch (Throwable) {
            }
        } finally {
            self::clearActiveJobIfMatches($this->jobId);

            if (isset($disk)) {
                try {
                    Storage::disk($disk)->delete($this->storedFilePath);
                } catch (Throwable) {
                }
            }
        }
    }

    public function middleware(): array
    {
        return [
            // Общая блокировка с RunSellerOneParseJob. dontRelease отключён иначе «конфликт»
            // задача исчезает из очереди без handle() → кеш остаётся queued, бейдж 0%.
            // releaseAfter — подождём и переиграем после освобождения lock или парсинга.
            // ->shared(): один ключ lock для всего Seller One (`laravel-queue-overlap:seller_one_heavy_global`),
            // без shared() ключ включает FQCN джобы — парсинг и refresh блокировали бы только свой класс.
            (new WithoutOverlapping('seller_one_heavy_global'))
                ->shared()
                ->expireAfter(3900)
                ->releaseAfter(45),
        ];
    }

    /**
     * Если воркер/очередь сняли задачу до финального Cache::put, discovery остаётся на «queued» навсегда.
     */
    private function markCacheFailedAndClearDiscoveryIfHung(string $publicMessage): void
    {
        $cacheKey = self::cacheKey($this->jobId);
        $snap = Cache::get($cacheKey);
        $st = is_array($snap) ? (string) ($snap['status'] ?? '') : '';
        if (!in_array($st, ['completed', 'failed'], true)) {
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => 'refresh_linked',
                'status' => 'failed',
                'message' => $publicMessage,
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));
        }
        self::clearActiveJobIfMatches($this->jobId);
    }

    public function failed(?Throwable $exception): void
    {
        $this->markCacheFailedAndClearDiscoveryIfHung(
            $exception?->getMessage() ?: 'Seller One refresh linked prices job failed unexpectedly.',
        );

        $message = $exception?->getMessage() ?: 'Seller One refresh linked prices job failed unexpectedly.';

        try {
            app(ImportTelegramNotificationService::class)->notifySellerOneRefreshFinished($this->jobId, [
                'status' => 'failed',
                'message' => $message,
            ]);
        } catch (Throwable) {
        }
    }

    public static function cacheKey(string $jobId): string
    {
        return "seller_one_refresh_linked_job:{$jobId}";
    }

    public static function activeKey(): string
    {
        return 'seller_one_refresh_linked_active_job';
    }

    public static function clearActiveJobIfMatches(string $jobId): void
    {
        $current = Cache::get(self::activeKey());
        if ($current === $jobId) {
            Cache::forget(self::activeKey());
        }
    }
}
