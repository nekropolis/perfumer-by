<?php

namespace Modules\Loyalty\Services;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\Users\Models\Client;

/**
 * Ступенчатая блокировка перебора кодов сертификатов и номеров скидочных карт.
 * Считаются только неудачные попытки; успешная попытка ступень не сбрасывает.
 * Ступень истекает через decay_seconds после окончания последней блокировки.
 */
class CodeAttemptLimiter
{
    /** SSR Next.js ходит в API с loopback — его не блокируем. */
    private const LOOPBACK_IPS = ['127.0.0.1', '::1'];

    public function lockedResponse(Request $request, ?Client $client): ?JsonResponse
    {
        $now = now()->getTimestamp();
        $retryAfter = 0;
        foreach ($this->identities($request, $client) as $identity) {
            $lockedUntil = (int) Cache::get($this->key($identity, 'locked_until'), 0);
            $retryAfter = max($retryAfter, $lockedUntil - $now);
        }

        if ($retryAfter <= 0) {
            return null;
        }

        $minutes = (int) ceil($retryAfter / 60);

        return response()->json([
            'message' => "Слишком много неверных попыток. Повторите через {$minutes} мин.",
            'code' => 'TOO_MANY_CODE_ATTEMPTS',
            'retry_after' => $retryAfter,
        ], 429, ['Retry-After' => (string) $retryAfter]);
    }

    public function recordFailure(Request $request, ?Client $client): void
    {
        $maxFailures = max(1, (int) config('auth.code_attempts.max_failures', 3));
        $lockSteps = array_values((array) config('auth.code_attempts.lock_seconds', [60, 1800, 86400]));
        $decaySeconds = (int) config('auth.code_attempts.decay_seconds', 86400);

        $reachedMaxStep = false;
        foreach ($this->identities($request, $client) as $identity) {
            $failsKey = $this->key($identity, 'fails');
            if (! Cache::has($failsKey)) {
                Cache::put($failsKey, 0, now()->addSeconds($decaySeconds));
            }
            if ((int) Cache::increment($failsKey) < $maxFailures) {
                continue;
            }

            Cache::forget($failsKey);
            $levelKey = $this->key($identity, 'level');
            $level = (int) Cache::get($levelKey, 0) + 1;
            $lockSeconds = (int) $lockSteps[min($level, count($lockSteps)) - 1];
            Cache::put($levelKey, $level, now()->addSeconds($lockSeconds + $decaySeconds));

            Cache::put(
                $this->key($identity, 'locked_until'),
                now()->getTimestamp() + $lockSeconds,
                now()->addSeconds($lockSeconds),
            );

            if ($level >= count($lockSteps)) {
                $reachedMaxStep = true;
            }
        }

        if ($reachedMaxStep) {
            $this->notifyTelegram($request, $client);
        }
    }

    /**
     * @return list<string>
     */
    private function identities(Request $request, ?Client $client): array
    {
        $identities = [];
        $ip = (string) $request->ip();
        if ($ip !== '' && ! in_array($ip, self::LOOPBACK_IPS, true)) {
            $identities[] = "ip:{$ip}";
        }
        if ($client) {
            $identities[] = "client:{$client->id}";
        }

        return $identities;
    }

    private function key(string $identity, string $suffix): string
    {
        return "loyalty:code_attempts:{$identity}:{$suffix}";
    }

    private function notifyTelegram(Request $request, ?Client $client): void
    {
        $lines = [
            '⚠️ Перебор кодов сертификатов / скидочных карт',
            'Блокировка ввода кодов на 24 ч.',
            'IP: ' . ($request->ip() ?: '—'),
            'Клиент: ' . ($client ? "#{$client->id} {$client->phone}" : 'гость'),
            'Запрос: ' . $request->method() . ' /' . $request->path(),
        ];
        $context = [
            'scope' => 'code_attempts_lock',
            'ip' => $request->ip(),
            'client_id' => $client?->id,
        ];

        try {
            SendTelegramMessageJob::dispatch(implode("\n", $lines), $context);
        } catch (\Throwable $e) {
            Log::warning('Code attempts telegram notification dispatch failed', array_merge($context, [
                'exception' => $e->getMessage(),
            ]));
        }
    }
}
