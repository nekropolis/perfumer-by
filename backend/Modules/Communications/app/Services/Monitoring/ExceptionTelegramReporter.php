<?php

namespace Modules\Communications\Services\Monitoring;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class ExceptionTelegramReporter
{
    private const DEDUP_SECONDS = 600;

    public function __construct(
        private readonly bool $allowInTesting = false,
    ) {
    }

    public function report(Throwable $exception, ?Request $request = null): void
    {
        try {
            if ($this->disabled() || $this->isExpected($exception)) {
                return;
            }

            $file = $this->relativePath($exception->getFile());
            $signature = implode('|', [$exception::class, $file, $exception->getLine()]);
            $context = $this->requestContext($request);

            $this->sendDeduplicated($signature, implode("\n", [
                '🚨 Backend exception',
                'env: '.app()->environment(),
                'type: '.$exception::class,
                'message: '.$this->truncate($this->scrub($exception->getMessage()), 300),
                'location: '.$file.':'.$exception->getLine(),
                'context: '.$context,
            ]));
        } catch (Throwable) {
            // Error reporting must never replace the original exception.
        }
    }

    /**
     * @param array<string, string|null> $payload
     */
    public function reportFrontend(array $payload): void
    {
        try {
            if ($this->disabled()) {
                return;
            }

            $routePath = $this->scrub((string) ($payload['routePath'] ?? $payload['path'] ?? 'unknown'));
            $name = $this->scrub((string) ($payload['name'] ?? 'Error'));
            $message = $this->truncate($this->scrub((string) ($payload['message'] ?? '')), 300);
            $signature = implode('|', [$routePath, $name, sha1($message)]);

            $this->sendDeduplicated('frontend|'.$signature, implode("\n", [
                '🚨 Frontend SSR',
                'env: '.app()->environment(),
                'type: '.$name,
                'message: '.$message,
                'context: '.implode(' ', array_filter([
                    $this->scrub((string) ($payload['method'] ?? '')),
                    $this->scrub((string) ($payload['path'] ?? '')),
                    $this->scrub((string) ($payload['routerKind'] ?? '')),
                    $routePath,
                    $this->scrub((string) ($payload['routeType'] ?? '')),
                ])),
            ]));
        } catch (Throwable) {
            // The internal reporting endpoint must always remain harmless.
        }
    }

    private function sendDeduplicated(string $signature, string $message): void
    {
        $hash = sha1($signature);
        $gateKey = 'exception_telegram:gate:'.$hash;
        $repeatKey = 'exception_telegram:repeats:'.$hash;

        if (! Cache::add($gateKey, true, self::DEDUP_SECONDS)) {
            if (! Cache::add($repeatKey, 1, self::DEDUP_SECONDS * 2)) {
                Cache::increment($repeatKey);
            }

            return;
        }

        $repeats = (int) Cache::pull($repeatKey, 0);
        if ($repeats > 0) {
            $message .= "\nrepeated: {$repeats}";
        }

        SendTelegramMessageJob::dispatchSync($message, [
            'scope' => 'exception_alert',
            'signature' => $hash,
        ], 2);
    }

    private function disabled(): bool
    {
        if (app()->environment('testing') && ! $this->allowInTesting) {
            return true;
        }

        $enabled = config('communications.telegram.enabled');
        $token = (string) (config('communications.telegram.bot_token') ?: config('services.telegram.bot_token', ''));
        $chatId = (string) (config('communications.telegram.chat_id') ?: config('services.telegram.chat_id', ''));

        return $enabled === false || $token === '' || $chatId === '';
    }

    private function isExpected(Throwable $exception): bool
    {
        if ($exception instanceof ValidationException
            || $exception instanceof AuthenticationException
            || $exception instanceof AuthorizationException
            || $exception instanceof ModelNotFoundException
            || $exception instanceof NotFoundHttpException
            || $exception instanceof ThrottleRequestsException
            || $exception instanceof TokenMismatchException) {
            return true;
        }

        return $exception instanceof HttpExceptionInterface && $exception->getStatusCode() < 500;
    }

    private function requestContext(?Request $request): string
    {
        if ($request !== null && ! app()->runningInConsole()) {
            return $this->scrub($request->method().' /'.ltrim($request->path(), '/'));
        }

        $command = (string) ($_SERVER['argv'][1] ?? '');
        if (str_starts_with($command, 'queue:') || str_starts_with($command, 'horizon')) {
            return 'queue';
        }

        return 'console';
    }

    private function relativePath(string $file): string
    {
        $base = rtrim(base_path(), DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

        return str_starts_with($file, $base) ? substr($file, strlen($base)) : basename($file);
    }

    private function scrub(string $value): string
    {
        $value = preg_replace('/\d{7,}/u', '[redacted-digits]', $value) ?? $value;
        $value = preg_replace('/(bearer\s+)[A-Za-z0-9._~+\/=-]+/iu', '$1[redacted]', $value) ?? $value;
        $value = preg_replace(
            '/((?:token|secret|password|passwd|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/iu',
            '$1[redacted]',
            $value,
        ) ?? $value;
        $value = preg_replace('/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u', '[redacted-token]', $value) ?? $value;

        return preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    }

    private function truncate(string $value, int $length): string
    {
        return mb_strlen($value) > $length ? mb_substr($value, 0, $length).'…' : $value;
    }
}
