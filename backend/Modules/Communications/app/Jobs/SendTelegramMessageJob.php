<?php

namespace Modules\Communications\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendTelegramMessageJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;
    public int $timeout = 20;

    /**
     * @param array<string, mixed> $context
     */
    public function __construct(
        public string $text,
        public array $context = []
    ) {
    }

    public function backoff(): array
    {
        return [5, 15, 30];
    }

    public function handle(): void
    {
        $communicationsEnabled = config('communications.telegram.enabled');
        $communicationsToken = (string) config('communications.telegram.bot_token', '');
        $communicationsChatId = (string) config('communications.telegram.chat_id', '');
        $communicationsTimeout = (int) config('communications.telegram.timeout', 0);

        $servicesToken = (string) config('services.telegram.bot_token', '');
        $servicesChatId = (string) config('services.telegram.chat_id', '');

        $enabled = is_bool($communicationsEnabled) ? $communicationsEnabled : true;
        $token = $communicationsToken !== '' ? $communicationsToken : $servicesToken;
        $chatId = $communicationsChatId !== '' ? $communicationsChatId : $servicesChatId;
        $timeout = $communicationsTimeout > 0 ? $communicationsTimeout : 10;

        if (!$enabled || $token === '' || $chatId === '') {
            return;
        }

        $text = mb_strlen($this->text) > 3500 ? mb_substr($this->text, 0, 3500) . "\n...(truncated)" : $this->text;

        $response = Http::timeout($timeout)
            ->asForm()
            ->post("https://api.telegram.org/bot{$token}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $text,
                'disable_web_page_preview' => true,
            ]);

        if (!$response->successful()) {
            Log::warning('Telegram queue notification failed: telegram api error', array_merge($this->context, [
                'http_status' => $response->status(),
                'response' => $response->body(),
            ]));
        }
    }

    public function failed(?\Throwable $exception): void
    {
        Log::warning('Telegram queue notification failed permanently', array_merge($this->context, [
            'exception' => $exception?->getMessage(),
        ]));
    }
}
