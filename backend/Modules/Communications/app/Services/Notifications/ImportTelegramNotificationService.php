<?php

namespace Modules\Communications\Services\Notifications;

use Modules\Communications\Jobs\SendTelegramMessageJob;
use Illuminate\Support\Facades\Log;
use Modules\Catalog\Models\VanilleImportJob;

class ImportTelegramNotificationService
{
    public function __construct(
        private readonly ImportTelegramMessageFormatter $formatter
    ) {
    }

    public function notifyVanilleJobFinished(VanilleImportJob $job): void
    {
        $text = $this->formatter->formatVanilleJobFinished($job);
        if ($text === null) {
            return;
        }

        $this->send($text, [
            'scope' => 'vanille_pipeline',
            'job_id' => $job->id,
            'type' => $job->type,
            'status' => $job->status,
        ]);
    }

    /**
     * @param array<string, mixed> $status
     */
    public function notifySellerOneParseFinished(string $jobId, array $status): void
    {
        $text = $this->formatter->formatSellerOneParseFinished($jobId, $status);
        if ($text === null) {
            return;
        }

        $this->send($text, [
            'scope' => 'seller_one_parse',
            'job_id' => $jobId,
            'status' => (string) ($status['status'] ?? ''),
        ]);
    }

    /**
     * @param array<string, mixed> $status
     */
    public function notifySellerOneRefreshFinished(string $jobId, array $status): void
    {
        $text = $this->formatter->formatSellerOneRefreshFinished($jobId, $status);
        if ($text === null) {
            return;
        }

        $this->send($text, [
            'scope' => 'seller_one_refresh',
            'job_id' => $jobId,
            'status' => (string) ($status['status'] ?? ''),
        ]);
    }

    /**
     * @param array<string, mixed> $context
     */
    private function send(string $text, array $context): void
    {
        try {
            SendTelegramMessageJob::dispatch($text, $context);
        } catch (\Throwable $e) {
            Log::warning('Import telegram notification queue dispatch failed', array_merge($context, [
                'exception' => $e->getMessage(),
            ]));
        }
    }
}
