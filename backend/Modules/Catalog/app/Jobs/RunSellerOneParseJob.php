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

    public int $tries = 1;
    public int $timeout = 3600;
    public bool $failOnTimeout = true;

    public function __construct(
        public string $jobId,
        public string $storedFilePath,
    ) {
    }

    public function handle(SupplierPriceImportService $service): void
    {
        $cacheKey = self::cacheKey($this->jobId);

        // Контроллер кладёт файл на `local`, но исторически возможны аплоады
        // с дефолтного FILESYSTEM_DISK (public). Ищем на обоих и используем тот,
        // где файл реально есть.
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
                'status' => 'failed',
                'message' => 'Файл для парсинга не найден',
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));
            self::clearActiveJobIfMatches($this->jobId);
            return;
        }

        $absolutePath = Storage::disk($disk)->path($this->storedFilePath);

        try {
            $result = $service->processAllRowsFromFile(
                $absolutePath,
                200,
                function (array $progress) use ($cacheKey): void {
                    $processed = (int) ($progress['processed'] ?? 0);
                    $totalRows = (int) ($progress['total_rows'] ?? 0);
                    $done = (bool) ($progress['done'] ?? false);

                    Cache::put($cacheKey, [
                        'job_id' => $this->jobId,
                        'status' => $done ? 'completed' : 'running',
                        'processed' => $processed,
                        'total_rows' => $totalRows,
                        'matched' => (int) ($progress['matched'] ?? 0),
                        'inserted' => (int) ($progress['inserted'] ?? 0),
                        'updated' => (int) ($progress['updated'] ?? 0),
                        'skipped_linked' => (int) ($progress['skipped_linked'] ?? 0),
                        'message' => $done
                            ? "Готово: обработано {$processed}"
                            : "Обработано {$processed}" . ($totalRows ? " / {$totalRows}" : ''),
                        'updated_at' => now()->toDateTimeString(),
                    ], now()->addHours(24));
                },
            );

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
                'message' => "Готово: обработано {$processed}",
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

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
            Cache::put($cacheKey, [
                'job_id' => $this->jobId,
                'status' => 'failed',
                'message' => $e->getMessage(),
                'updated_at' => now()->toDateTimeString(),
            ], now()->addHours(24));

            try {
                app(ImportTelegramNotificationService::class)->notifySellerOneParseFinished($this->jobId, [
                    'status' => 'failed',
                    'message' => $e->getMessage(),
                ]);
            } catch (Throwable) {
            }
        } finally {
            // Снимаем флаг активности для discovery-эндпоинта (виджета в шапке),
            // даже если была ошибка — иначе виджет будет показывать «зомби»-задачу.
            self::clearActiveJobIfMatches($this->jobId);

            try {
                Storage::disk($disk)->delete($this->storedFilePath);
            } catch (Throwable) {
            }
        }
    }

    public function middleware(): array
    {
        return [
            // Глобальный lock на heavy Seller One операции:
            // parse и refresh не должны выполняться параллельно.
            (new WithoutOverlapping('seller_one_heavy_global'))
                ->expireAfter(3900)
                ->dontRelease(),
        ];
    }

    public function failed(?Throwable $exception): void
    {
        $message = $exception?->getMessage() ?: 'Seller One parse job failed unexpectedly.';

        try {
            app(ImportTelegramNotificationService::class)->notifySellerOneParseFinished($this->jobId, [
                'status' => 'failed',
                'message' => $message,
            ]);
        } catch (Throwable) {
        }
    }

    public static function cacheKey(string $jobId): string
    {
        return "seller_one_parse_job:{$jobId}";
    }

    /**
     * Общий ключ для discovery-эндпоинта: «какой Seller One job сейчас активен».
     * Виджет активных задач в шапке админки читает именно его, чтобы не зависеть
     * от localStorage конкретного браузера/вкладки (джоб мог быть запущен
     * в другой сессии).
     *
     * Контроллер выставляет этот ключ при старте; сам джоб очищает его при
     * завершении/ошибке (и ТОЛЬКО если значение всё ещё совпадает с нашим
     * jobId — иначе другой, стартовавший позже, job затёрся бы).
     */
    public static function activeKey(): string
    {
        return 'seller_one_parse_active_job';
    }

    /**
     * Атомарно сбрасывает `activeKey`, только если там наш jobId.
     * Защищает от случая, когда параллельно уже стартовал следующий parse
     * и мы не должны «отобрать» у него ключ активности.
     */
    public static function clearActiveJobIfMatches(string $jobId): void
    {
        $current = Cache::get(self::activeKey());
        if ($current === $jobId) {
            Cache::forget(self::activeKey());
        }
    }
}
