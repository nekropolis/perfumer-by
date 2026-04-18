<?php

namespace Modules\Catalog\Services\Notifications;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Catalog\Models\VanilleImportJob;

class TelegramNotificationService
{
    public function notifyVanilleImportJob(VanilleImportJob $job): void
    {
        $token = config('services.telegram.bot_token');
        $chatId = config('services.telegram.chat_id');

        if (!$token || !$chatId) {
            return;
        }

        $title = 'Vanille import';
        $lines = [
            'Job #' . $job->id,
            'Type: ' . $job->type,
            'Status: ' . $job->status,
        ];

        if ($job->message) {
            $lines[] = 'Message: ' . $job->message;
        }

        if ($job->error) {
            $lines[] = 'Error: ' . $job->error;
        }

        $text = implode("\n", $lines);
        if (strlen($text) > 3500) {
            $text = mb_substr($text, 0, 3500) . "\n...(truncated)";
        }

        try {
            Http::timeout(10)
                ->asForm()
                ->post("https://api.telegram.org/bot{$token}/sendMessage", [
                    'chat_id' => $chatId,
                    'text' => $text,
                    'disable_web_page_preview' => true,
                ])
                ->throw();
        } catch (\Throwable $e) {
            Log::warning('Telegram notification failed', [
                'job_id' => $job->id,
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
