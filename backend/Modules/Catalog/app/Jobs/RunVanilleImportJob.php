<?php

namespace Modules\Catalog\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Modules\Catalog\Models\VanilleImportJob;
use Modules\Catalog\Services\Notifications\TelegramNotificationService;
use Modules\ImportExport\Services\Vanille\VanilleImportService;
use Throwable;

class RunVanilleImportJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;
    public int $timeout = 60;
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
                ->expireAfter(120)
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

        try {
            app(TelegramNotificationService::class)->notifyVanilleImportJob($job->fresh());
        } catch (Throwable) {
        }
    }
}
