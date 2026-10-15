<?php

namespace Tests\Unit;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\Communications\Services\Monitoring\ExceptionTelegramReporter;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

class ExceptionTelegramReporterTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('communications.telegram.enabled', true);
        config()->set('communications.telegram.bot_token', 'test-token');
        config()->set('communications.telegram.chat_id', 'test-chat');
        Cache::flush();
    }

    public function test_expected_exceptions_are_not_reported(): void
    {
        Bus::fake();
        $reporter = new ExceptionTelegramReporter(allowInTesting: true);
        $validation = new ValidationException(Validator::make([], ['field' => ['required']]));

        foreach ([
            $validation,
            new AuthenticationException(),
            new AuthorizationException(),
            new ModelNotFoundException(),
            new NotFoundHttpException(),
            new HttpException(409),
            new ThrottleRequestsException(),
            new TokenMismatchException(),
        ] as $exception) {
            $reporter->report($exception);
        }

        Bus::assertNotDispatched(SendTelegramMessageJob::class);
    }

    public function test_reporting_is_disabled_in_testing_environment(): void
    {
        Bus::fake();

        app(ExceptionTelegramReporter::class)->report(new RuntimeException('Application failure'));

        Bus::assertNotDispatched(SendTelegramMessageJob::class);
    }

    public function test_duplicate_is_suppressed_and_phone_like_digits_are_scrubbed(): void
    {
        Bus::fake();
        $reporter = new ExceptionTelegramReporter(allowInTesting: true);
        $exception = new RuntimeException('Ошибка клиента 375291234567 token=secret-value');

        $reporter->report($exception);
        $reporter->report($exception);

        Bus::assertDispatchedSyncTimes(SendTelegramMessageJob::class, 1);
        Bus::assertDispatchedSync(SendTelegramMessageJob::class, function (SendTelegramMessageJob $job): bool {
            return str_contains($job->text, '[redacted-digits]')
                && str_contains($job->text, 'token=[redacted]')
                && ! str_contains($job->text, '375291234567')
                && ! str_contains($job->text, 'secret-value');
        });
    }

    public function test_telegram_failure_does_not_escape_reporter(): void
    {
        Http::fake(fn () => throw new RuntimeException('Telegram unavailable'));

        (new ExceptionTelegramReporter(allowInTesting: true))
            ->report(new RuntimeException('Application failure'));

        $this->assertTrue(true);
    }
}
