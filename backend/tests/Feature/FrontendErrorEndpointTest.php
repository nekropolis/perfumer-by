<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\Communications\Services\Monitoring\ExceptionTelegramReporter;
use Tests\TestCase;

class FrontendErrorEndpointTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('communications.telegram.enabled', true);
        config()->set('communications.telegram.bot_token', 'test-token');
        config()->set('communications.telegram.chat_id', 'test-chat');
        Cache::flush();
        Bus::fake();
        $this->app->instance(
            ExceptionTelegramReporter::class,
            new ExceptionTelegramReporter(allowInTesting: true),
        );
    }

    public function test_non_loopback_request_is_rejected(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.5'])
            ->postJson('/api/internal/frontend-errors', $this->payload())
            ->assertForbidden();

        Bus::assertNotDispatched(SendTelegramMessageJob::class);
    }

    public function test_loopback_request_dispatches_one_deduplicated_alert(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/api/internal/frontend-errors', $this->payload())
            ->assertNoContent();

        $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/api/internal/frontend-errors', $this->payload())
            ->assertNoContent();

        Bus::assertDispatchedSyncTimes(SendTelegramMessageJob::class, 1);
        Bus::assertDispatchedSync(SendTelegramMessageJob::class, function (SendTelegramMessageJob $job): bool {
            return str_contains($job->text, 'Frontend SSR')
                && str_contains($job->text, '/catalog/[slug]');
        });
    }

    /**
     * @return array<string, string>
     */
    private function payload(): array
    {
        return [
            'digest' => 'digest-123',
            'path' => '/catalog/test',
            'method' => 'GET',
            'routerKind' => 'App Router',
            'routePath' => '/catalog/[slug]',
            'routeType' => 'render',
            'name' => 'Error',
            'message' => 'SSR failed',
        ];
    }
}
