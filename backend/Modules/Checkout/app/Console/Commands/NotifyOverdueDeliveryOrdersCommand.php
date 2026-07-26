<?php

namespace Modules\Checkout\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Modules\Checkout\Models\Order;
use Modules\Communications\Jobs\SendTelegramMessageJob;

class NotifyOverdueDeliveryOrdersCommand extends Command
{
    private const LOCK_KEY = 'orders:notify-overdue-delivery';

    private const LOCK_SECONDS = 120;

    protected $signature = 'orders:notify-overdue-delivery
        {--dry-run : Только показать просроченные заказы без Telegram}';

    protected $description = 'Просроченная дата отправки (не done/cancelled): уведомление в Telegram';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $today = now('Europe/Minsk')->toDateString();

        $orders = Order::query()
            ->whereNotNull('shipment_date')
            ->whereDate('shipment_date', '<', $today)
            ->whereNotIn('status', ['done', 'cancelled', 'completed'])
            ->orderBy('shipment_date')
            ->orderBy('id')
            ->get(['id', 'customer_name', 'phone', 'status', 'shipment_date', 'delivery_city', 'total']);

        if ($orders->isEmpty()) {
            $this->info("Просроченных заказов на {$today} нет.");

            return self::SUCCESS;
        }

        $this->info("Найдено просроченных: {$orders->count()} (сегодня {$today}).");

        $lines = [
            '⚠️ Просроченная дата отправки',
            "Сегодня: {$today}",
            'Заказов: '.$orders->count(),
            '',
        ];

        foreach ($orders->take(40) as $order) {
            $date = $order->shipment_date?->format('d.m.Y') ?? '—';
            $name = trim((string) ($order->customer_name ?? '')) ?: 'Без имени';
            $phone = trim((string) ($order->phone ?? '')) ?: '—';
            $city = trim((string) ($order->delivery_city ?? ''));
            $status = (string) ($order->status ?? '—');
            $line = "#{$order->id} · {$date} · {$name} · {$phone} · {$status}";
            if ($city !== '') {
                $line .= " · {$city}";
            }
            $lines[] = $line;
        }

        if ($orders->count() > 40) {
            $lines[] = '… и ещё '.($orders->count() - 40);
        }

        $message = implode("\n", $lines);

        if ($dryRun) {
            $this->line($message);

            return self::SUCCESS;
        }

        $lock = Cache::lock(self::LOCK_KEY, self::LOCK_SECONDS);
        if (! $lock->get()) {
            $this->info('Другой процесс уже отправляет уведомление — пропускаем.');

            return self::SUCCESS;
        }

        try {
            SendTelegramMessageJob::dispatchSync($message, [
                'type' => 'orders_overdue_delivery',
                'today' => $today,
                'count' => $orders->count(),
            ]);
            $this->info('Уведомление отправлено в Telegram.');

            return self::SUCCESS;
        } finally {
            $lock->release();
        }
    }
}
