<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\ImportExport\Jobs\RunAllparfumeSyncJob;
use Modules\ImportExport\Jobs\WatchAllparfumePriceUpdateJob;
use Modules\ImportExport\Services\Allparfume\AllparfumeBrandSyncService;
use Modules\ImportExport\Services\Allparfume\AllparfumePriceUpdateWatchService;
use Modules\ImportExport\Services\Allparfume\Support\AllparfumeHttpClient;
use Modules\Settings\Services\ShopSettingService;
use RuntimeException;
use Tests\TestCase;

class AllparfumePriceUpdateWatchTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        Cache::flush();
    }

    public function test_it_seeds_date_without_refresh_on_first_run(): void
    {
        $this->fakeHomepage('25.08.2026');
        $this->bindSettings(null, ['allparfume_homepage_prices_date' => '2026-08-25']);

        $result = app(AllparfumePriceUpdateWatchService::class)->check();

        $this->assertSame('seeded', $result['action']);
        $this->assertSame('2026-08-25', $result['date']);
        Queue::assertNothingPushed();
    }

    public function test_it_does_not_refresh_when_date_is_unchanged(): void
    {
        $this->fakeHomepage('25.08.2026');
        $this->bindSettings('2026-08-25', null);

        $result = app(AllparfumePriceUpdateWatchService::class)->check();

        $this->assertSame('unchanged', $result['action']);
        Queue::assertNothingPushed();
    }

    public function test_it_queues_refresh_when_homepage_date_changes(): void
    {
        $this->fakeHomepage('26.08.2026');
        $this->bindSettings('2026-08-25', ['allparfume_homepage_prices_date' => '2026-08-26']);

        $result = app(AllparfumePriceUpdateWatchService::class)->check();

        $this->assertSame('queued', $result['action']);
        $this->assertSame('2026-08-26', $result['date']);
        Queue::assertPushed(RunAllparfumeSyncJob::class, function (RunAllparfumeSyncJob $job): bool {
            return $job->mode === RunAllparfumeSyncJob::MODE_REFRESH
                && $job->notifyOnFinish === true
                && $job->sourcePricesDate === '2026-08-26';
        });
    }

    public function test_it_keeps_previous_date_when_sync_is_already_running(): void
    {
        $this->fakeHomepage('26.08.2026');
        $this->bindSettings('2026-08-25', null);
        Cache::put(RunAllparfumeSyncJob::activeKey(), 'running-job', now()->addHour());

        $result = app(AllparfumePriceUpdateWatchService::class)->check();

        $this->assertSame('busy', $result['action']);
        Queue::assertNothingPushed();
    }

    public function test_it_reschedules_check_in_one_hour_when_site_is_down(): void
    {
        $this->bindUnavailableHttp();
        $this->app->instance(ShopSettingService::class, $this->createStub(ShopSettingService::class));

        $result = app(AllparfumePriceUpdateWatchService::class)->run(1);

        $this->assertSame('retry_scheduled', $result['action']);
        $this->assertSame(1, $result['attempt']);
        Queue::assertPushed(WatchAllparfumePriceUpdateJob::class, function (WatchAllparfumePriceUpdateJob $job): bool {
            return $job->attempt === 2;
        });
        Queue::assertNotPushed(SendTelegramMessageJob::class);
        Queue::assertNotPushed(RunAllparfumeSyncJob::class);
    }

    public function test_it_notifies_telegram_after_five_failed_checks(): void
    {
        $this->bindUnavailableHttp();
        $this->app->instance(ShopSettingService::class, $this->createStub(ShopSettingService::class));

        $result = app(AllparfumePriceUpdateWatchService::class)->run(5);

        $this->assertSame('unavailable', $result['action']);
        Queue::assertNotPushed(WatchAllparfumePriceUpdateJob::class);
        Queue::assertPushed(SendTelegramMessageJob::class, function (SendTelegramMessageJob $job): bool {
            return str_contains($job->text, 'не удалось проверить дату')
                && str_contains($job->text, 'Попыток: 5');
        });
    }

    public function test_cron_refresh_job_sends_telegram_with_counts(): void
    {
        $sync = $this->createStub(AllparfumeBrandSyncService::class);
        $sync->method('refreshExistingProducts')->willReturn([
            'processed_products' => 10,
            'updated_variants' => 8,
            'created_variants' => 2,
            'updated_offers' => 20,
            'created_offers' => 3,
            'errors' => 1,
        ]);

        $job = new RunAllparfumeSyncJob('job-1', RunAllparfumeSyncJob::MODE_REFRESH, true, '2026-08-26');
        $job->handle($sync);

        Queue::assertPushed(SendTelegramMessageJob::class, function (SendTelegramMessageJob $job): bool {
            return str_contains($job->text, 'цены обновлены')
                && str_contains($job->text, 'Обновлено: 8')
                && str_contains($job->text, 'Новых: 2')
                && str_contains($job->text, '26.08.2026');
        });
    }

    public function test_manual_refresh_job_does_not_send_telegram(): void
    {
        $sync = $this->createStub(AllparfumeBrandSyncService::class);
        $sync->method('refreshExistingProducts')->willReturn([
            'processed_products' => 1,
            'updated_variants' => 1,
            'created_variants' => 0,
            'updated_offers' => 1,
            'created_offers' => 0,
            'errors' => 0,
        ]);

        $job = new RunAllparfumeSyncJob('job-2', RunAllparfumeSyncJob::MODE_REFRESH, false);
        $job->handle($sync);

        Queue::assertNotPushed(SendTelegramMessageJob::class);
    }

    private function fakeHomepage(string $date): void
    {
        Http::fake([
            'https://allparfume.by' => Http::response(
                "Обновление цен: {$date} [3 дня назад]",
                200,
            ),
            'https://allparfume.by/*' => Http::response(
                "Обновление цен: {$date} [3 дня назад]",
                200,
            ),
        ]);
    }

    /**
     * @param  array<string, string>|null  $expectedSet
     */
    private function bindSettings(?string $stored, ?array $expectedSet): void
    {
        $settings = $this->createMock(ShopSettingService::class);
        $settings->method('get')->willReturn($stored);
        if ($expectedSet === null) {
            $settings->expects($this->never())->method('setMany');
        } else {
            $settings->expects($this->once())->method('setMany')->with($expectedSet);
        }

        $this->app->instance(ShopSettingService::class, $settings);
    }

    private function bindUnavailableHttp(): void
    {
        $http = $this->createMock(AllparfumeHttpClient::class);
        $http->expects($this->once())
            ->method('fetchUrl')
            ->willThrowException(new RuntimeException('GET https://allparfume.by/ failed: HTTP 503'));
        $this->app->instance(AllparfumeHttpClient::class, $http);
    }
}
