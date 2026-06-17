<?php

namespace Modules\Catalog\Jobs;

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

class RunSellerOneParseJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * См. {@see RunSellerOneRefreshLinkedPricesJob::$tries}: общая блокировка с refresh,
     * интервал release ~45 с — нужен запас минимум на длительный sibling-job.
     */
    public int $tries = 90;

    /** Таймаут одного chunk (продолжение — отдельный dispatch). */
    public int $timeout = 7200;

    public bool $failOnTimeout = true;

    /** Бюджет CPU на один chunk; по истечении ставим continuation job. */
    private const CHUNK_TIME_BUDGET_SECONDS = 3300;

    public function __construct(
        public string $jobId,
        public string $storedFilePath,
        public int $rowOffset = 0,
    ) {
    }

    public function handle(SupplierPriceImportService $service): void
    {
        $cacheKey = self::cacheKey($this->jobId);
        $shouldCleanup = false;
        $disk = null;

        foreach (['local', 'public'] as $candidate) {
            if (Storage::disk($candidate)->exists($this->storedFilePath)) {
                $disk = $candidate;
                break;
            }
        }

        if ($disk === null) {
            self::markFailed($cacheKey, $this->jobId, 'Файл для парсинга не найден');
            self::clearActiveJobIfMatches($this->jobId);
            $service->clearSellerOneParseArtifacts($this->jobId);

            return;
        }

        $absolutePath = Storage::disk($disk)->path($this->storedFilePath);

        try {
            $publishProgress = function (array $progress) use ($cacheKey): void {
                self::publishParseProgress($cacheKey, $this->jobId, $progress);
            };

            if ($this->rowOffset === 0) {
                $publishProgress([
                    'status' => 'running',
                    'message' => 'Подготовка: чтение файла…',
                    'processed' => 0,
                    'total_rows' => 0,
                ]);
            }

            $result = $service->processAllRowsFromFile(
                $absolutePath,
                200,
                $publishProgress,
                $this->jobId,
                $this->rowOffset,
                self::CHUNK_TIME_BUDGET_SECONDS,
            );

            if (! empty($result['has_more'])) {
                $processed = (int) ($result['processed'] ?? 0);
                $totalRows = (int) ($result['total_rows'] ?? 0);
                $nextOffset = (int) ($result['next_offset'] ?? $this->rowOffset);

                $publishProgress([
                    'status' => 'running',
                    'message' => "Продолжение: {$processed} / {$totalRows}",
                    'processed' => $processed,
                    'total_rows' => $totalRows,
                    'matched' => (int) ($result['matched'] ?? 0),
                    'inserted' => (int) ($result['inserted'] ?? 0),
                    'updated' => (int) ($result['updated'] ?? 0),
                    'skipped_linked' => (int) ($result['skipped_linked'] ?? 0),
                ]);

                self::dispatch($this->jobId, $this->storedFilePath, $nextOffset);

                return;
            }

            $processed = (int) ($result['processed'] ?? 0);
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'status' => 'completed',
                'processed' => $processed,
                'total_rows' => (int) ($result['total_rows'] ?? 0),
                'matched' => (int) ($result['matched'] ?? 0),
                'inserted' => (int) ($result['inserted'] ?? 0),
                'updated' => (int) ($result['updated'] ?? 0),
                'skipped_linked' => (int) ($result['skipped_linked'] ?? 0),
                'marked_preorder' => (int) ($result['marked_preorder'] ?? 0),
                'message' => (string) ($result['message'] ?? "Готово: обработано {$processed}"),
                'parse_diagnostics' => $result['parse_diagnostics'] ?? null,
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            $shouldCleanup = true;

            try {
                app(ImportTelegramNotificationService::class)->notifySellerOneParseFinished($this->jobId, [
                    'status' => 'completed',
                    'processed' => $processed,
                    'total_rows' => (int) ($result['total_rows'] ?? 0),
                    'updated' => (int) ($result['updated'] ?? 0),
                    'inserted' => (int) ($result['inserted'] ?? 0),
                    'message' => "Готово: обработано {$processed}",
                ]);
            } catch (Throwable) {
            }
        } catch (Throwable $e) {
            $shouldCleanup = true;
            self::markFailed($cacheKey, $this->jobId, $e->getMessage());
        } finally {
            if ($shouldCleanup) {
                self::clearActiveJobIfMatches($this->jobId);
                $service->clearSellerOneParseArtifacts($this->jobId);

                if ($disk !== null) {
                    try {
                        Storage::disk($disk)->delete($this->storedFilePath);
                    } catch (Throwable) {
                    }
                }
            }
        }
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('seller_one_heavy_global'))
                ->shared()
                ->expireAfter(7500)
                ->releaseAfter(45),
        ];
    }

    public function failed(?Throwable $exception): void
    {
        $message = $exception?->getMessage() ?: 'Seller One parse job failed unexpectedly.';
        $cacheKey = self::cacheKey($this->jobId);
        self::markFailed($cacheKey, $this->jobId, $message);
        self::clearActiveJobIfMatches($this->jobId);

        try {
            app(SupplierPriceImportService::class)->clearSellerOneParseArtifacts($this->jobId);
        } catch (Throwable) {
        }
    }

    public static function markFailed(string $cacheKey, string $jobId, string $message): void
    {
        $snap = Cache::get($cacheKey);
        $processed = (int) (is_array($snap) ? ($snap['processed'] ?? 0) : 0);
        $totalRows = (int) (is_array($snap) ? ($snap['total_rows'] ?? 0) : 0);
        $statusPayload = [
            'job_id' => $jobId,
            'status' => 'failed',
            'processed' => $processed,
            'total_rows' => $totalRows,
            'matched' => (int) (is_array($snap) ? ($snap['matched'] ?? 0) : 0),
            'inserted' => (int) (is_array($snap) ? ($snap['inserted'] ?? 0) : 0),
            'updated' => (int) (is_array($snap) ? ($snap['updated'] ?? 0) : 0),
            'skipped_linked' => (int) (is_array($snap) ? ($snap['skipped_linked'] ?? 0) : 0),
            'message' => $processed > 0 && $totalRows > 0
                ? "{$message} (обработано {$processed} / {$totalRows})"
                : $message,
            'updated_at' => now()->toDateTimeString(),
        ];

        Cache::put($cacheKey, $statusPayload, now()->addHours(24));

        try {
            app(ImportTelegramNotificationService::class)->notifySellerOneParseFinished($jobId, $statusPayload);
        } catch (Throwable) {
        }
    }

    public static function cacheKey(string $jobId): string
    {
        return "seller_one_parse_job:{$jobId}";
    }

    /**
     * @param  array<string, mixed>  $progress
     */
    public static function publishParseProgress(string $cacheKey, string $jobId, array $progress): void
    {
        $processed = (int) ($progress['processed'] ?? 0);
        $totalRows = (int) ($progress['total_rows'] ?? 0);
        $done = (bool) ($progress['done'] ?? false);
        $explicitStatus = isset($progress['status']) ? (string) $progress['status'] : '';
        $status = $done
            ? 'completed'
            : ($explicitStatus !== '' ? $explicitStatus : 'running');

        $message = trim((string) ($progress['message'] ?? ''));
        if ($message === '') {
            $message = $done
                ? "Готово: обработано {$processed}"
                : ($totalRows > 0 ? "Обработано {$processed} / {$totalRows}" : 'Выполняется…');
        }

        Cache::put($cacheKey, [
            'job_id' => $jobId,
            'status' => $status,
            'processed' => $processed,
            'total_rows' => $totalRows,
            'matched' => (int) ($progress['matched'] ?? 0),
            'inserted' => (int) ($progress['inserted'] ?? 0),
            'updated' => (int) ($progress['updated'] ?? 0),
            'skipped_linked' => (int) ($progress['skipped_linked'] ?? 0),
            'message' => $message,
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));
    }

    public static function activeKey(): string
    {
        return 'seller_one_parse_active_job';
    }

    public static function clearActiveJobIfMatches(string $jobId): void
    {
        $current = Cache::get(self::activeKey());
        if ($current === $jobId) {
            Cache::forget(self::activeKey());
        }
    }
}
