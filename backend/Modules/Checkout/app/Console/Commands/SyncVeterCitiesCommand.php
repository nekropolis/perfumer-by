<?php

namespace Modules\Checkout\Console\Commands;

use Illuminate\Console\Command;
use Modules\Checkout\Services\Veter\VeterCitiesSyncService;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Throwable;

class SyncVeterCitiesCommand extends Command
{
    protected $signature = 'veter:sync-cities';

    protected $description = 'Sync Veter courier tracks, districts (delivery days) and cities into local cache tables';

    public function handle(VeterCitiesSyncService $sync): int
    {
        $this->info('Syncing Veter geography…');

        try {
            $result = $sync->sync();
        } catch (Throwable $e) {
            $this->error($e->getMessage());
            $this->notifyFailure($e->getMessage());

            return self::FAILURE;
        }

        if ($result['cities'] <= 0) {
            $reason = 'Синхронизация завершилась без городов (cities=0). Проверьте ответ API ветерОК.';
            $this->error($reason);
            $this->notifyFailure($reason);

            return self::FAILURE;
        }

        $this->info(sprintf(
            'Done: tracks=%d, districts=%d, cities=%d',
            $result['tracks'],
            $result['districts'],
            $result['cities'],
        ));

        return self::SUCCESS;
    }

    private function notifyFailure(string $reason): void
    {
        $message = implode("\n", [
            '⚠️ Синхронизация городов ветерОК не выполнена',
            'Команда: veter:sync-cities',
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
            'Причина: '.$reason,
        ]);

        try {
            SendTelegramMessageJob::dispatchSync($message, [
                'type' => 'veter_cities_sync_failed',
            ]);
            $this->info('Уведомление об ошибке отправлено в Telegram.');
        } catch (Throwable $e) {
            $this->warn('Не удалось отправить уведомление в Telegram: '.$e->getMessage());
        }
    }
}
