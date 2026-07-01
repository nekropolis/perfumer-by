<?php

namespace Modules\Catalog\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
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

    public int $tries = 90;
    public int $timeout = 7200;
    public bool $failOnTimeout = true;

    private const int CHUNK_TIME_BUDGET_SECONDS = 3300;

    public function __construct(
        public string $jobId,
        public string $storedFilePath,
        public int $rowOffset = 0,
    ) {}

    public function handle(SupplierPriceImportService $service): void
    {
        $globalLockKey = 'seller_one_parse_running:' . $this->jobId;

        if (!Cache::add($globalLockKey, 1, now()->addHours(3))) {

            return; // уже выполняется
        }

        $cacheKey = self::cacheKey($this->jobId);

        // 🛑 HARD STOP если уже завершено
        if (Cache::get($cacheKey . ':finished')) {
            return;
        }

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

            $processed = (int) ($result['processed'] ?? 0);
            $totalRows = (int) ($result['total_rows'] ?? 0);

            /**
             * ✅ Единственный источник истины — has_more
             */
            if (!empty($result['has_more'])) {
                $nextOffset = (int) ($result['next_offset'] ?? $this->rowOffset);

                $publishProgress([
                    'status' => 'running',
                    'message' => "Продолжение: {$processed} / {$totalRows}",
                    'processed' => $processed,
                    'total_rows' => $totalRows,
                ]);

                if (Cache::get($cacheKey . ':finished')) {
                    return;
                }

                if (($nextOffset ?? 0) <= $this->rowOffset) {
                    Log::error('SellerOne infinite loop prevented', [
                        'jobId' => $this->jobId,
                        'nextOffset' => $nextOffset,
                        'currentOffset' => $this->rowOffset,
                    ]);

                    return;
                }

                self::dispatch($this->jobId, $this->storedFilePath, $nextOffset);
                return;
            }

            // ✅ Завершение
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'status' => 'completed',
                'processed' => $processed,
                'total_rows' => $totalRows,
                'matched' => (int) ($result['matched'] ?? 0),
                'inserted' => (int) ($result['inserted'] ?? 0),
                'updated' => (int) ($result['updated'] ?? 0),
                'skipped_linked' => (int) ($result['skipped_linked'] ?? 0),
                'marked_preorder' => (int) ($result['marked_preorder'] ?? 0),
                'message' => (string) ($result['message'] ?? "Готово: обработано {$processed}"),
                'parse_diagnostics' => $result['parse_diagnostics'] ?? null,
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            // 🛑 lock finished
            Cache::put($cacheKey . ':finished', [
                'at' => now()->toDateTimeString()
            ], now()->addDays(7));

            $shouldCleanup = true;

            self::notifyParseCompletedIfNeeded($this->jobId, [
                'status' => 'completed',
                'processed' => $processed,
                'total_rows' => $totalRows,
            ]);

        } catch (Throwable $e) {
            $shouldCleanup = true;
            self::markFailed($cacheKey, $this->jobId, $e->getMessage());
        } finally {
            Cache::forget('seller_one_parse_running:' . $this->jobId);

            if ($shouldCleanup) {
                self::clearActiveJobIfMatches($this->jobId);
                $service->clearSellerOneParseArtifacts($this->jobId);

                if ($disk !== null) {
                    try {
                        Storage::disk($disk)->delete($this->storedFilePath);
                    } catch (Throwable) {}
                }
            }
        }
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('seller_one_heavy_global:' . $this->jobId))
                ->shared()
                ->expireAfter(7500)
                ->releaseAfter(30),
        ];
    }

    public static function cacheKey(string $jobId): string
    {
        return "seller_one_parse_job:{$jobId}";
    }

    public static function activeKey(): string
    {
        return 'seller_one_parse_active_job';
    }

    public static function clearActiveJobIfMatches(string $jobId): void
    {
        if (Cache::get(self::activeKey()) === $jobId) {
            Cache::forget(self::activeKey());
        }
    }

    public static function publishParseProgress(string $cacheKey, string $jobId, array $progress): void
    {
        Cache::put($cacheKey, [
            'job_id' => $jobId,
            'status' => $progress['status'] ?? 'running',
            'processed' => (int) ($progress['processed'] ?? 0),
            'total_rows' => (int) ($progress['total_rows'] ?? 0),
            'message' => $progress['message'] ?? '',
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));
    }

    public static function markFailed(string $cacheKey, string $jobId, string $message): void
    {
        Cache::put($cacheKey, [
            'job_id' => $jobId,
            'status' => 'failed',
            'message' => $message,
            'updated_at' => now()->toDateTimeString(),
        ], now()->addHours(24));
    }

    public static function notifyParseCompletedIfNeeded(string $jobId, array $status): void
    {
        try {
            app(ImportTelegramNotificationService::class)
                ->notifySellerOneParseFinished($jobId, $status);
        } catch (Throwable) {}
    }
}
