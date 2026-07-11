<?php

namespace Modules\Catalog\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Modules\Catalog\Models\PriceRefreshRun;
use Modules\Catalog\Support\CatalogApiCacheService;
use Modules\Catalog\Services\Pricing\PriceRefreshOrchestrator;
use Modules\Communications\Services\Notifications\ImportTelegramNotificationService;
use Throwable;

class RunPriceRefreshJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $timeout = 7200;

    public bool $failOnTimeout = true;

    public function __construct(
        public int $runId,
        public string $jobId,
    ) {
    }

    public function handle(PriceRefreshOrchestrator $orchestrator): void
    {
        $run = PriceRefreshRun::query()->findOrFail($this->runId);
        $cacheKey = self::cacheKey($this->jobId);

        Cache::put($cacheKey, [
            'job_id' => $this->jobId,
            'run_id' => $this->runId,
            'status' => PriceRefreshRun::STATUS_RUNNING,
            'message' => 'Запуск обновления цен…',
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));

        app(CatalogApiCacheService::class)->beginDeferredInvalidation();

        try {
            $stats = $orchestrator->run(
                $run,
                function (array $progress) use ($cacheKey): void {
                    Cache::put($cacheKey, array_merge(
                        [
                            'job_id' => $this->jobId,
                            'run_id' => $this->runId,
                            'status' => PriceRefreshRun::STATUS_RUNNING,
                            'updated_at' => now()->toDateTimeString(),
                        ],
                        $progress,
                    ), now()->addHours(24));
                },
            );

            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'run_id' => $this->runId,
                'status' => PriceRefreshRun::STATUS_COMPLETED,
                'stats' => $stats,
                'message' => 'Обновление цен завершено',
                'progress' => 100,
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            try {
                app(ImportTelegramNotificationService::class)->notifyPriceRefreshFinished($this->runId, $this->jobId, [
                    'status' => 'completed',
                    'stats' => $stats,
                ]);
            } catch (Throwable) {
            }
        } catch (Throwable $e) {
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'run_id' => $this->runId,
                'status' => PriceRefreshRun::STATUS_FAILED,
                'message' => $e->getMessage(),
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            try {
                app(ImportTelegramNotificationService::class)->notifyPriceRefreshFinished($this->runId, $this->jobId, [
                    'status' => 'failed',
                    'message' => $e->getMessage(),
                    'stats' => $run->fresh()?->stats,
                ]);
            } catch (Throwable) {
            }

            throw $e;
        } finally {
            app(CatalogApiCacheService::class)->commitInvalidation();
            self::clearActiveJobIfMatches($this->jobId);
        }
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('price_refresh_global'))
                ->expireAfter(7500)
                ->releaseAfter(60),
        ];
    }

    public static function cacheKey(string $jobId): string
    {
        return 'price_refresh_job:' . $jobId;
    }

    public static function activeKey(): string
    {
        return 'price_refresh_active_job';
    }

    public static function clearActiveJobIfMatches(string $jobId): void
    {
        if (Cache::get(self::activeKey()) === $jobId) {
            Cache::forget(self::activeKey());
        }
    }
}
