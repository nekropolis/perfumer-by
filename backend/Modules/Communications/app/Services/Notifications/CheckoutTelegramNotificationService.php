<?php

namespace Modules\Communications\Services\Notifications;

use Modules\Communications\Jobs\SendTelegramMessageJob;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\StockNotificationRequest;

class CheckoutTelegramNotificationService
{
    public function __construct(
        private readonly CheckoutTelegramMessageFormatter $formatter
    ) {
    }

    public function notifyNewOrder(Order $order): void
    {
        $this->sendMessage(
            $this->formatter->formatNewOrder($order),
            ['scope' => 'order', 'order_id' => $order->id]
        );
    }

    public function notifyCustomerRequest(StockNotificationRequest $record): void
    {
        $this->sendMessage(
            $this->formatter->formatCustomerRequest($record),
            ['scope' => 'customer_request', 'request_id' => $record->id, 'kind' => $record->kind]
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function sendTestMessage(?string $message = null): array
    {
        $text = trim((string) $message);
        if ($text === '') {
            $text = '✅ Тест Telegram-уведомления от backend ' . now()->format('d.m.Y H:i:s');
        }

        return $this->dispatchMessage($text, ['scope' => 'test']);
    }

    private function sendMessage(string $text, array $context = []): void
    {
        $result = $this->resolveTelegramConfig();
        if (!($result['enabled'] ?? false) || !($result['has_token'] ?? false) || !($result['has_chat_id'] ?? false)) {
            Log::warning('Checkout telegram notification skipped: missing or disabled config', array_merge($context, [
                'enabled' => $result['enabled'] ?? false,
                'has_token' => $result['has_token'] ?? false,
                'has_chat_id' => $result['has_chat_id'] ?? false,
                'config_source' => $result['config_source'] ?? 'unknown',
            ]));
            return;
        }

        try {
            SendTelegramMessageJob::dispatch($text, $context);
        } catch (\Throwable $e) {
            Log::warning('Checkout telegram notification queue dispatch failed', array_merge($context, [
                'exception' => $e->getMessage(),
            ]));
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function dispatchMessage(string $text, array $context = []): array
    {
        $config = $this->resolveTelegramConfig();
        $enabled = (bool) ($config['enabled'] ?? false);
        $token = (string) ($config['token'] ?? '');
        $chatId = (string) ($config['chat_id'] ?? '');
        $timeout = (int) ($config['timeout'] ?? 10);
        $source = (string) ($config['config_source'] ?? 'unknown');

        if (!$enabled) {
            Log::info('Checkout telegram notification skipped: disabled', $context);
            return [
                'ok' => false,
                'reason' => 'disabled',
                'enabled' => false,
                'has_token' => $token !== '',
                'has_chat_id' => $chatId !== '',
                'config_source' => $source,
            ];
        }

        if ($token === '' || $chatId === '') {
            Log::warning('Checkout telegram notification skipped: missing token or chat id', array_merge($context, [
                'has_token' => $token !== '',
                'has_chat_id' => $chatId !== '',
            ]));
            return [
                'ok' => false,
                'reason' => 'missing_credentials',
                'enabled' => true,
                'has_token' => $token !== '',
                'has_chat_id' => $chatId !== '',
                'config_source' => $source,
            ];
        }

        try {
            $response = Http::timeout($timeout)
                ->asForm()
                ->post("https://api.telegram.org/bot{$token}/sendMessage", [
                    'chat_id' => $chatId,
                    'text' => $text,
                    'disable_web_page_preview' => true,
                ]);

            if (!$response->successful()) {
                Log::warning('Checkout telegram notification failed: telegram api error', array_merge($context, [
                    'http_status' => $response->status(),
                    'response' => $response->body(),
                ]));
                return [
                    'ok' => false,
                    'reason' => 'telegram_api_error',
                    'enabled' => true,
                    'has_token' => true,
                    'has_chat_id' => true,
                    'config_source' => $source,
                    'http_status' => $response->status(),
                    'response' => $response->body(),
                ];
            }

            return [
                'ok' => true,
                'reason' => 'sent',
                'enabled' => true,
                'has_token' => true,
                'has_chat_id' => true,
                'config_source' => $source,
                'http_status' => $response->status(),
            ];
        } catch (\Throwable $e) {
            Log::warning('Checkout telegram notification failed', array_merge($context, [
                'exception' => $e->getMessage(),
            ]));
            return [
                'ok' => false,
                'reason' => 'exception',
                'enabled' => true,
                'has_token' => true,
                'has_chat_id' => true,
                'config_source' => $source,
                'exception' => $e->getMessage(),
            ];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function resolveTelegramConfig(): array
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
        $source = $communicationsToken !== '' || $communicationsChatId !== '' ? 'communications' : 'services';
        return [
            'enabled' => $enabled,
            'token' => $token,
            'chat_id' => $chatId,
            'timeout' => $timeout,
            'config_source' => $source,
            'has_token' => $token !== '',
            'has_chat_id' => $chatId !== '',
        ];
    }
}
