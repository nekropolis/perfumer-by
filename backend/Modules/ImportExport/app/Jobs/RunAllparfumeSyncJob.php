<?php

namespace Modules\ImportExport\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Modules\Communications\Jobs\SendTelegramMessageJob;
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
        public bool $notifyOnFinish = false,
        public ?string $sourcePricesDate = null,
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

            $this->notifyCronFinished($stats);
        } catch (Throwable $e) {
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'job_type' => $this->mode,
                'status' => 'failed',
                'message' => $e->getMessage(),
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            $this->notifyCronFailed($e);

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

    public static function queueIfIdle(
        string $mode,
        bool $notifyOnFinish = false,
        ?string $sourcePricesDate = null,
    ): ?string {
        if (Cache::get(self::activeKey())) {
            return null;
        }

        $jobId = (string) Str::uuid();
        Cache::put(self::activeKey(), $jobId, now()->addHours(24));
        Cache::put(self::cacheKey($jobId), [
            'job_id' => $jobId,
            'job_type' => $mode,
            'status' => 'queued',
            'message' => 'Задача поставлена в очередь',
            'progress' => 0,
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));

        self::dispatch($jobId, $mode, $notifyOnFinish, $sourcePricesDate);

        return $jobId;
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

    /**
     * @param  array<string, mixed>  $stats
     */
    private function notifyCronFinished(array $stats): void
    {
        if (! $this->notifyOnFinish) {
            return;
        }

        $updated = (int) ($stats['updated_variants'] ?? $stats['updated_products'] ?? 0);
        $created = (int) ($stats['created_variants'] ?? $stats['created_products'] ?? 0);

        $this->notifyTelegram(implode("\n", [
            '✅ Крон Allparfume: цены обновлены',
            'Дата на сайте: '.$this->formatSourceDate(),
            'Обновлено: '.$updated,
            'Новых: '.$created,
            'Офферов обновлено: '.(int) ($stats['updated_offers'] ?? 0)
                .', новых: '.(int) ($stats['created_offers'] ?? $stats['created_shop_offers'] ?? 0),
            'Ошибок: '.(int) ($stats['errors'] ?? 0),
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
        ]), [
            'type' => 'allparfume_cron_refresh_done',
            'job_id' => $this->jobId,
        ]);
    }

    private function notifyCronFailed(Throwable $e): void
    {
        if (! $this->notifyOnFinish) {
            return;
        }

        $this->notifyTelegram(implode("\n", [
            '⚠️ Крон Allparfume: ошибка обновления цен',
            'Дата на сайте: '.$this->formatSourceDate(),
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
            'Ошибка: '.$e->getMessage(),
        ]), [
            'type' => 'allparfume_cron_refresh_error',
            'job_id' => $this->jobId,
        ]);
    }

    private function formatSourceDate(): string
    {
        $raw = trim((string) $this->sourcePricesDate);
        if ($raw === '') {
            return '—';
        }

        $date = \DateTimeImmutable::createFromFormat('Y-m-d', $raw);

        return $date instanceof \DateTimeImmutable ? $date->format('d.m.Y') : $raw;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function notifyTelegram(string $message, array $context): void
    {
        try {
            SendTelegramMessageJob::dispatch($message, $context);
        } catch (Throwable $e) {
            Log::warning('Allparfume cron telegram dispatch failed', array_merge($context, [
                'exception' => $e->getMessage(),
            ]));
        }
    }
}
