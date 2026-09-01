<?php

namespace Modules\ImportExport\Services\Allparfume;

use Illuminate\Support\Facades\Log;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\ImportExport\Jobs\RunAllparfumeSyncJob;
use Modules\ImportExport\Jobs\WatchAllparfumePriceUpdateJob;
use Modules\ImportExport\Services\Allparfume\Parsers\AllparfumeHomepageParser;
use Modules\ImportExport\Services\Allparfume\Support\AllparfumeHttpClient;
use Modules\Settings\Services\ShopSettingService;
use RuntimeException;
use Throwable;

class AllparfumePriceUpdateWatchService
{
    public const SOURCE_DATE_KEY = 'allparfume_homepage_prices_date';

    public const MAX_ATTEMPTS = 5;

    private const HOMEPAGE_URL = 'https://allparfume.by/';

    public function __construct(
        private readonly AllparfumeHttpClient $http,
        private readonly AllparfumeHomepageParser $parser,
        private readonly ShopSettingService $settings,
    ) {
    }

    /**
     * @return array{action: string, date?: string, job_id?: string, previous?: string, attempt?: int, error?: string}
     */
    public function run(int $attempt = 1): array
    {
        $attempt = max(1, $attempt);

        try {
            return $this->check();
        } catch (Throwable $e) {
            return $this->handleUnavailable($attempt, $e);
        }
    }

    /**
     * @return array{action: string, date: string, job_id?: string, previous?: string}
     */
    public function check(): array
    {
        $html = $this->http->fetchUrl(self::HOMEPAGE_URL);
        $date = $this->parser->parsePricesUpdatedOn($html);
        if ($date === null) {
            throw new RuntimeException('Не удалось прочитать дату обновления цен на allparfume.by');
        }

        $previous = $this->settings->get(self::SOURCE_DATE_KEY);
        if ($previous === null || $previous === '') {
            $this->settings->setMany([self::SOURCE_DATE_KEY => $date]);

            return [
                'action' => 'seeded',
                'date' => $date,
            ];
        }

        if ($previous === $date) {
            return [
                'action' => 'unchanged',
                'date' => $date,
            ];
        }

        $jobId = RunAllparfumeSyncJob::queueIfIdle(
            RunAllparfumeSyncJob::MODE_REFRESH,
            true,
            $date,
        );
        if ($jobId === null) {
            return [
                'action' => 'busy',
                'date' => $date,
                'previous' => $previous,
            ];
        }

        $this->settings->setMany([self::SOURCE_DATE_KEY => $date]);

        return [
            'action' => 'queued',
            'date' => $date,
            'job_id' => $jobId,
        ];
    }

    /**
     * @return array{action: string, attempt: int, error: string}
     */
    private function handleUnavailable(int $attempt, Throwable $e): array
    {
        if ($attempt < self::MAX_ATTEMPTS) {
            WatchAllparfumePriceUpdateJob::dispatch($attempt + 1)
                ->delay(now()->addHour());

            return [
                'action' => 'retry_scheduled',
                'attempt' => $attempt,
                'error' => $e->getMessage(),
            ];
        }

        $this->notifyTelegram(implode("\n", [
            '⚠️ Allparfume: не удалось проверить дату обновления цен',
            'Сайт allparfume.by недоступен',
            'Попыток: '.$attempt.' из '.self::MAX_ATTEMPTS.' (интервал 1 ч)',
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
            'Ошибка: '.$e->getMessage(),
        ]), [
            'type' => 'allparfume_watch_unavailable',
            'attempt' => $attempt,
        ]);

        return [
            'action' => 'unavailable',
            'attempt' => $attempt,
            'error' => $e->getMessage(),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function notifyTelegram(string $message, array $context): void
    {
        try {
            SendTelegramMessageJob::dispatch($message, $context);
        } catch (Throwable $e) {
            Log::warning('Allparfume watch telegram dispatch failed', array_merge($context, [
                'exception' => $e->getMessage(),
            ]));
        }
    }
}
