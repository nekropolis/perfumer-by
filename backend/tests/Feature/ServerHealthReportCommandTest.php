<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Bus;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Tests\TestCase;

class ServerHealthReportCommandTest extends TestCase
{
    public function test_local_environment_does_not_send_health_report(): void
    {
        Bus::fake();
        $this->app['env'] = 'local';

        $this->artisan('server:health-report', ['--weekly' => true])
            ->expectsOutput('Local environment — отчёт в Telegram не отправляем.')
            ->assertSuccessful();

        Bus::assertNotDispatched(SendTelegramMessageJob::class);
    }
}
