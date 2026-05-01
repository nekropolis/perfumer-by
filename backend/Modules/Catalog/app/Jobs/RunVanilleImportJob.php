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
    public int $timeout = 300;
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
            // Prevent duplicate queue messages from processing same import job in parallel.
            (new WithoutOverlapping('vanille-import-job:' . $this->jobId))
                ->expireAfter(360)
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
