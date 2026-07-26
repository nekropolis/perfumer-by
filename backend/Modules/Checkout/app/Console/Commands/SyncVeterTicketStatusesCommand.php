<?php

namespace Modules\Checkout\Console\Commands;

use Illuminate\Console\Command;
use Modules\Checkout\Services\Veter\VeterTicketStatusSyncService;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Throwable;

class SyncVeterTicketStatusesCommand extends Command
{
    protected $signature = 'veter:sync-ticket-statuses';

    protected $description = 'Sync Veter ticket statuses (getStatus) for orders in_delivery with shipment_id';

    public function handle(VeterTicketStatusSyncService $sync): int
    {
        $this->info('Syncing Veter ticket statuses…');

        try {
            $result = $sync->syncAllInDelivery(VeterTicketStatusSyncService::SOURCE_CRON);
        } catch (Throwable $e) {
            $this->error($e->getMessage());
            $this->notifyFailureSummary([[
                'order_id' => 0,
                'shipment_id' => '',
                'reason' => $e->getMessage(),
            ]], 0);

            return self::FAILURE;
        }

        $updated = count($result['updated']);
        $failed = count($result['failed']);

        $this->info(sprintf(
            'Done: total=%d, updated=%d, failed=%d',
            $result['total'],
            $updated,
            $failed,
        ));

        if ($failed > 0) {
            $this->notifyFailureSummary($result['failed'], $result['total']);

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @param  list<array{order_id: int, shipment_id: string, reason: string}>  $failed
     */
    private function notifyFailureSummary(array $failed, int $total): void
    {
        $lines = [
            '⚠️ ветерОК getStatus: ошибки синхронизации',
            'Команда: veter:sync-ticket-statuses',
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
            'Всего заказов в выборке: '.$total,
            'Ошибок: '.count($failed),
        ];

        $shown = array_slice($failed, 0, 8);
        foreach ($shown as $row) {
            $orderPart = ($row['order_id'] ?? 0) > 0 ? '#'.$row['order_id'] : '—';
            $shipPart = trim((string) ($row['shipment_id'] ?? ''));
            $lines[] = $orderPart
                .($shipPart !== '' ? ' ('.$shipPart.')' : '')
                .': '.mb_substr((string) ($row['reason'] ?? ''), 0, 180);
        }
        if (count($failed) > count($shown)) {
            $lines[] = '… и ещё '.(count($failed) - count($shown));
        }

        $message = implode("\n", $lines);

        try {
            SendTelegramMessageJob::dispatchSync($message, [
                'type' => 'veter_ticket_status_sync_failed',
            ]);
            $this->info('Уведомление об ошибке отправлено в Telegram.');
        } catch (Throwable $e) {
            $this->warn('Не удалось отправить уведомление в Telegram: '.$e->getMessage());
        }
    }
}
