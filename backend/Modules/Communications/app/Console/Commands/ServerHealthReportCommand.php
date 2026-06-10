<?php

namespace Modules\Communications\Console\Commands;

use Illuminate\Console\Command;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\Communications\Services\Monitoring\ServerHealthMonitorService;

class ServerHealthReportCommand extends Command
{
    protected $signature = 'server:health-report
        {--weekly : Полный еженедельный отчёт (отправляется всегда)}
        {--dry-run : Сформировать отчёт без отправки в Telegram}';

    protected $description = 'Проверка сервера и отправка алерта в Telegram при проблемах';

    public function handle(ServerHealthMonitorService $monitor): int
    {
        if (!config('communications.server_monitor.enabled', true)) {
            $this->warn('Server monitor disabled (SERVER_MONITOR_ENABLED=false).');

            return self::SUCCESS;
        }

        $weekly = (bool) $this->option('weekly');
        $dryRun = (bool) $this->option('dry-run');

        $report = $monitor->collect($weekly);
        $message = $monitor->formatTelegramMessage($report);

        $this->line($message);

        $shouldSend = $weekly || $report['has_alerts'];

        if ($dryRun) {
            $this->info($shouldSend ? 'Dry-run: сообщение было бы отправлено.' : 'Dry-run: отправка не требуется.');

            return self::SUCCESS;
        }

        if (!$shouldSend) {
            $this->info('Проблем не найдено — Telegram не отправляем.');

            return self::SUCCESS;
        }

        SendTelegramMessageJob::dispatchSync($message, [
            'type' => $weekly ? 'server_health_weekly' : 'server_health_alert',
            'host' => $report['host'],
        ]);

        $this->info('Отчёт отправлен в Telegram.');

        return self::SUCCESS;
    }
}
