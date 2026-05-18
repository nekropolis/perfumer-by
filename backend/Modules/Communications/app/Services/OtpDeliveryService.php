<?php

namespace Modules\Communications\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Communications\DTO\OtpDeliveryResult;

class OtpDeliveryService
{
    public const CHANNEL_VIBER = 'viber';
    public const CHANNEL_SMS = 'sms';
    public const CHANNEL_MANUAL = 'manual';

    public function sendCode(string $phone, string $code): OtpDeliveryResult
    {
        return $this->sendText($phone, "Код подтверждения: {$code}. Никому не сообщайте этот код.");
    }

    public function sendText(string $phone, string $text): OtpDeliveryResult
    {
        $viberFirst = (bool) config('communications.otp.viber_first', true);

        if ($viberFirst && (bool) config('communications.viber.enabled', true)) {
            $viberResult = $this->sendViaViber($phone, $text);
            if ($viberResult->sent) {
                return $viberResult;
            }
        }

        $smsResult = $this->sendViaSms($phone, $text);
        if ($smsResult->sent) {
            return new OtpDeliveryResult(
                sent: true,
                channel: self::CHANNEL_SMS,
                status: 'sent',
                providerMessageId: $smsResult->providerMessageId,
                fallbackUsed: $viberFirst,
            );
        }

        return new OtpDeliveryResult(
            sent: true,
            channel: self::CHANNEL_MANUAL,
            status: 'manual_fallback',
            error: $smsResult->error ?: 'Viber and SMS delivery failed; manual fallback is used',
            fallbackUsed: true,
        );
    }

    protected function sendViaViber(string $phone, string $text): OtpDeliveryResult
    {
        $driver = (string) config('communications.viber.driver', 'mock');

        if ($driver === 'mock') {
            $registered = $this->isMockViberRegistered($phone);
            if (!$registered) {
                return new OtpDeliveryResult(
                    sent: false,
                    channel: self::CHANNEL_VIBER,
                    status: 'unavailable',
                    error: 'Phone is not registered in Viber',
                );
            }

            Log::info('OTP sent via mock Viber', ['phone' => $phone]);

            return new OtpDeliveryResult(
                sent: true,
                channel: self::CHANNEL_VIBER,
                status: 'sent',
                providerMessageId: 'mock-viber-' . uniqid(),
            );
        }

        $endpoint = (string) config('communications.viber.endpoint', '');
        $token = (string) config('communications.viber.token', '');

        if ($endpoint === '' || $token === '') {
            return new OtpDeliveryResult(
                sent: false,
                channel: self::CHANNEL_VIBER,
                status: 'failed',
                error: 'Viber credentials are not configured',
            );
        }

        try {
            $response = Http::timeout((int) config('communications.viber.timeout', 5))
                ->withToken($token)
                ->post($endpoint, [
                    'to' => $phone,
                    'sender' => (string) config('communications.viber.sender', 'Perfumer'),
                    'message' => $text,
                ]);

            if ($response->successful()) {
                return new OtpDeliveryResult(
                    sent: true,
                    channel: self::CHANNEL_VIBER,
                    status: 'sent',
                    providerMessageId: (string) ($response->json('message_id') ?? ''),
                );
            }

            return new OtpDeliveryResult(
                sent: false,
                channel: self::CHANNEL_VIBER,
                status: 'failed',
                error: 'Viber API responded with ' . $response->status(),
            );
        } catch (\Throwable $e) {
            return new OtpDeliveryResult(
                sent: false,
                channel: self::CHANNEL_VIBER,
                status: 'failed',
                error: $e->getMessage(),
            );
        }
    }

    protected function sendViaSms(string $phone, string $text): OtpDeliveryResult
    {
        if (!(bool) config('communications.sms.enabled', true)) {
            return new OtpDeliveryResult(
                sent: false,
                channel: self::CHANNEL_SMS,
                status: 'failed',
                error: 'SMS channel is disabled',
            );
        }

        $driver = (string) config('communications.sms.driver', 'mock');
        if ($driver === 'mock') {
            Log::info('OTP sent via mock SMS', ['phone' => $phone]);

            return new OtpDeliveryResult(
                sent: true,
                channel: self::CHANNEL_SMS,
                status: 'sent',
                providerMessageId: 'mock-sms-' . uniqid(),
            );
        }

        $endpoint = (string) config('communications.sms.endpoint', '');
        $token = (string) config('communications.sms.token', '');

        if ($endpoint === '' || $token === '') {
            return new OtpDeliveryResult(
                sent: false,
                channel: self::CHANNEL_SMS,
                status: 'failed',
                error: 'SMS credentials are not configured',
            );
        }

        try {
            $response = Http::timeout((int) config('communications.sms.timeout', 5))
                ->withToken($token)
                ->post($endpoint, [
                    'to' => $phone,
                    'sender' => (string) config('communications.sms.sender', 'Perfumer'),
                    'message' => $text,
                ]);

            if ($response->successful()) {
                return new OtpDeliveryResult(
                    sent: true,
                    channel: self::CHANNEL_SMS,
                    status: 'sent',
                    providerMessageId: (string) ($response->json('message_id') ?? ''),
                );
            }

            return new OtpDeliveryResult(
                sent: false,
                channel: self::CHANNEL_SMS,
                status: 'failed',
                error: 'SMS API responded with ' . $response->status(),
            );
        } catch (\Throwable $e) {
            return new OtpDeliveryResult(
                sent: false,
                channel: self::CHANNEL_SMS,
                status: 'failed',
                error: $e->getMessage(),
            );
        }
    }

    protected function isMockViberRegistered(string $phone): bool
    {
        $mode = (string) config('communications.viber.mock_registration_mode', 'all');
        if ($mode === 'all') {
            return true;
        }
        if ($mode === 'none') {
            return false;
        }

        $raw = (string) config('communications.viber.mock_registered_phones', '');
        $phones = array_values(array_filter(array_map(static fn ($item) => preg_replace('/\D+/', '', trim($item)) ?? '', explode(',', $raw))));

        return in_array($phone, $phones, true);
    }
}
