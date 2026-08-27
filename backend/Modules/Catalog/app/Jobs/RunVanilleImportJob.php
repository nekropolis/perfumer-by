<?php

namespace Modules\Catalog\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Modules\Catalog\Models\VanilleImportJob;
use Modules\Catalog\Models\VanilleImportJobLog;
use Modules\Communications\Services\Notifications\ImportTelegramNotificationService;
use Modules\ImportExport\Services\Vanille\VanilleImportService;
use App\Services\AuditLogService;
use Throwable;

class RunVanilleImportJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    /** Seconds per queue invocation; queue connection `retry_after` must be greater than this. */
    public int $timeout = 3600;
    public bool $failOnTimeout = true;

    public function __construct(public int $jobId)
    {
    }

    public function handle(VanilleImportService $service): void
    {
        $service->runQueuedJob($this->jobId);
    }

    public function middleware(): array
    {
        return [
            // Must exceed $timeout (import batches can run up to 3600s).
            (new WithoutOverlapping('vanille-import-job:' . $this->jobId))
                ->expireAfter(7200)
                ->dontRelease(),
        ];
    }

    public function failed(?Throwable $exception): void
    {
        $job = VanilleImportJob::query()->find($this->jobId);
        if (!$job) {
            return;
        }

        $errorMessage = $exception?->getMessage() ?: 'Queue worker stopped or timed out while processing the job.';

        if (
            $job->type === VanilleImportService::JOB_TYPE_IMPORT_PARSED_PRODUCTS
            && str_contains(mb_strtolower($errorMessage), 'timed out')
        ) {
            $result = is_array($job->result) ? $job->result : [];
            $state = is_array($result['state'] ?? null) ? $result['state'] : [];
            $offset = (int) ($state['offset'] ?? 0);
            $totalFiles = (int) ($result['total_files'] ?? 0);
            if ($offset > 0 && ($totalFiles === 0 || $offset < $totalFiles)) {
                $job->update([
                    'status' => 'pending',
                    'progress' => max(5, min(95, $totalFiles > 0 ? (int) round(($offset / $totalFiles) * 100) : 5)),
                    'message' => sprintf('Импорт спарсенных товаров: таймаут, продолжаем с %d / %d файлов', $offset, max($totalFiles, $offset)),
                    'error' => null,
                    'finished_at' => null,
                ]);

                VanilleImportJobLog::query()->create([
                    'vanille_import_job_id' => $job->id,
                    'level' => 'warning',
                    'message' => $errorMessage,
                    'context' => [
                        'exception' => $exception ? $exception::class : null,
                        'job_type' => $job->type,
                        'failed_via' => 'queue_timeout_auto_resume',
                        'offset' => $offset,
                        'total_files' => $totalFiles,
                    ],
                ]);

                try {
                    self::dispatch($this->jobId);
                } catch (Throwable) {
                }

                return;
            }
        }

        $job->update([
            'status' => 'failed',
            'progress' => 100,
            'message' => 'Парсинг: ошибка выполнения',
            'error' => $errorMessage,
            'finished_at' => now(),
        ]);

        VanilleImportJobLog::query()->create([
            'vanille_import_job_id' => $job->id,
            'level' => 'error',
            'message' => $errorMessage,
            'context' => [
                'exception' => $exception ? $exception::class : null,
                'job_type' => $job->type,
                'failed_via' => 'queue_failed_callback',
            ],
        ]);

        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_VANILLE_IMPORT,
                $job->id,
                AuditLogService::ACTION_FAILED,
                $errorMessage,
                array_filter([
                    'exception' => $exception ? $exception::class : null,
                    'job_type' => $job->type,
                    'failed_via' => 'queue_failed_callback',
                ]),
            );
        } catch (Throwable) {
        }

        try {
            app(ImportTelegramNotificationService::class)->notifyVanilleJobFinished($job->fresh());
        } catch (Throwable) {
        }
    }
}
