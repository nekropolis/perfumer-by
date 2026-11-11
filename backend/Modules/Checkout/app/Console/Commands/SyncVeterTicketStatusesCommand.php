<?php

namespace Modules\Checkout\Console\Commands;

use Illuminate\Console\Command;
use Modules\Checkout\Services\Veter\VeterTicketStatusSyncService;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Throwable;

class SyncVeterTicketStatusesCommand extends Command
{
    protected $signature = 'veter:sync-ticket-statuses';

    protected $description = 'Sync Veter ticket statuses (getStatus) for orders assembled/in_delivery with shipment_id';

    public function handle(VeterTicketStatusSyncService $sync): int
    {
        if (! config('services.veter.enabled')) {
            $this->warn('Veter is disabled (VETER=false) — skip.');

            return self::SUCCESS;
        }

        $hour = (int) now('Europe/Minsk')->format('G');
        if ($hour >= 21 || $hour < 8) {
            $this->warn('Quiet hours 21:00–08:00 Europe/Minsk — skip getStatus.');

            return self::SUCCESS;
        }

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
        $ids = [];
        $reasons = [];
        foreach ($failed as $row) {
            $orderId = (int) ($row['order_id'] ?? 0);
            $ids[] = $orderId > 0 ? '#'.$orderId : '—';
            $reasons[$this->briefFailureReason((string) ($row['reason'] ?? ''))] = true;
        }

        $shown = array_slice($ids, 0, 20);
        $lines = [
            '⚠️ ветерОК getStatus: '.count($failed).' ошибок из '.$total,
            now('Europe/Minsk')->format('Y-m-d H:i:s'),
            implode(', ', array_keys($reasons)),
            implode(', ', $shown).(count($ids) > count($shown) ? ' … и ещё '.(count($ids) - count($shown)) : ''),
            'Подробности в laravel.log',
        ];

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

    private function briefFailureReason(string $reason): string
    {
        if (preg_match('/HTTP (\d{3})/', $reason, $matches) === 1) {
            return 'HTTP '.$matches[1];
        }

        $flat = trim((string) preg_replace('/\s+/', ' ', strip_tags($reason)));
        if ($flat === '' || str_contains($reason, '<html') || str_contains($reason, '<!DOCTYPE')) {
            return 'ошибка API';
        }

        return mb_substr($flat, 0, 80);
    }
}
