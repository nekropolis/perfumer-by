<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Allparfume\AllparfumePriceUpdateWatchService;
use Throwable;

class WatchAllparfumePriceUpdateCommand extends Command
{
    protected $signature = 'allparfume:watch-price-update';

    protected $description = 'Ночью проверить дату «Обновление цен» на allparfume.by и запустить refresh, если она сменилась';

    public function handle(AllparfumePriceUpdateWatchService $watch): int
    {
        $this->info('Allparfume: проверка даты обновления цен на сайте');

        try {
            $result = $watch->run(1);
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $date = (string) ($result['date'] ?? '');
        $action = (string) ($result['action'] ?? '');
        $attempt = (int) ($result['attempt'] ?? 1);

        match ($action) {
            'seeded' => $this->info("Дата сохранена без запуска: {$date}"),
            'unchanged' => $this->info("Дата не изменилась: {$date}"),
            'busy' => $this->warn("Дата сменилась ({$date}), но синхронизация уже выполняется — повтор завтра"),
            'queued' => $this->info("Дата сменилась, обновление цен поставлено в очередь: {$date}"),
            'retry_scheduled' => $this->warn(
                "Сайт недоступен (попытка {$attempt}/5), следующая проверка через 1 час"
            ),
            'unavailable' => $this->error(
                'Сайт недоступен после 5 попыток, уведомление отправлено в Telegram'
            ),
            default => $this->warn("Неизвестный результат: {$action}"),
        };

        return $action === 'unavailable' ? self::FAILURE : self::SUCCESS;
    }
}
