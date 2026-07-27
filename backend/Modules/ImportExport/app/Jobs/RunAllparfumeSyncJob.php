<?php

namespace Modules\ImportExport\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Modules\ImportExport\Services\Allparfume\AllparfumeBrandSyncService;
use Throwable;

class RunAllparfumeSyncJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public const MODE_REFRESH = 'refresh';

    public const MODE_FULL = 'full';

    public int $tries = 1;

    public int $timeout = 14400;

    public bool $failOnTimeout = true;

    public function __construct(
        public string $jobId,
        public string $mode,
    ) {
    }

    public function handle(AllparfumeBrandSyncService $syncService): void
    {
        $cacheKey = self::cacheKey($this->jobId);
        $title = $this->mode === self::MODE_FULL ? 'Allparfume: парсинг' : 'Allparfume: обновить цены';

        Cache::put($cacheKey, [
            'job_id' => $this->jobId,
            'job_type' => $this->mode,
            'status' => 'running',
            'message' => $title.': запуск…',
            'progress' => 0,
            'processed' => 0,
            'total' => 0,
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));

        try {
            $onProgress = function (array $progress) use ($cacheKey): void {
                Cache::put($cacheKey, array_merge(
                    [
                        'job_id' => $this->jobId,
                        'job_type' => $this->mode,
                        'status' => 'running',
                        'updated_at' => now()->toDateTimeString(),
                    ],
                    $progress,
                ), now()->addHours(24));
            };

            $stats = $this->mode === self::MODE_FULL
                ? $syncService->syncAllSiteBrands($onProgress)
                : $syncService->refreshExistingProducts($onProgress);

            $doneMessage = $title.': готово';
            if ($this->mode === self::MODE_FULL) {
                $doneMessage = sprintf(
                    '%s: брендов %d (с сайта %d), создано товаров %d, обновлено %d, ошибок %d',
                    $title,
                    (int) ($stats['processed_brands'] ?? 0),
                    (int) ($stats['discovered_from_site'] ?? 0),
                    (int) ($stats['created_products'] ?? 0),
                    (int) ($stats['updated_products'] ?? 0),
                    (int) ($stats['errors'] ?? 0),
                );
            } elseif (is_array($stats)) {
                $doneMessage = sprintf(
                    '%s: обработано %d, ошибок %d',
                    $title,
                    (int) ($stats['processed_products'] ?? 0),
                    (int) ($stats['errors'] ?? 0),
                );
            }

            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => $this->mode,
                'status' => 'completed',
                'stats' => $stats,
                'progress' => 100,
                'message' => $doneMessage,
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));
        } catch (Throwable $e) {
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => $this->mode,
                'status' => 'failed',
                'message' => $e->getMessage(),
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            throw $e;
        } finally {
            self::clearActiveJobIfMatches($this->jobId);
        }
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('allparfume_sync_global'))
                ->expireAfter(14500)
                ->releaseAfter(60),
        ];
    }

    public static function cacheKey(string $jobId): string
    {
        return 'allparfume_sync_job:'.$jobId;
    }

    public static function activeKey(): string
    {
        return 'allparfume_sync_active_job';
    }

    public static function clearActiveJobIfMatches(string $jobId): void
    {
        if (Cache::get(self::activeKey()) === $jobId) {
            Cache::forget(self::activeKey());
        }
    }
}
