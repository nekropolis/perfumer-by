<?php

namespace Modules\Settings\Console\Commands;

use Illuminate\Console\Command;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\Settings\Services\ShopSettingService;
use Modules\Settings\Support\WaitingDiscountDeliveryDate;

class AdvanceWaitingDiscountDeliveryDateCommand extends Command
{
    protected $signature = 'shop:advance-waiting-discount-delivery-date
        {--dry-run : Проверить без сохранения и без Telegram}';

    protected $description = 'Если дата отправки под заказ (скидка 3%) в прошлом — сдвинуть на +7 дней от сегодня и уведомить в Telegram';

    public function handle(ShopSettingService $settings): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $current = (string) $settings->get(
                WaitingDiscountDeliveryDate::SETTING_KEY,
                WaitingDiscountDeliveryDate::DEFAULT
            );
            $change = WaitingDiscountDeliveryDate::nextIfPast($current);

            if ($change === null) {
                $this->info("Дата актуальна ({$current}) — изменений не требуется.");

                return self::SUCCESS;
            }

            $this->info("Dry-run: было {$change['from']}, стало бы {$change['to']}.");

            return self::SUCCESS;
        }

        $change = $settings->advanceWaitingDiscountDeliveryDateIfPast();

        if ($change === null) {
            $this->info('Дата актуальна — изменений не требуется.');

            return self::SUCCESS;
        }

        $message = implode("\n", [
            '📅 Дата отправки товаров под заказ (скидка 3%) обновлена автоматически',
            "Было: {$change['from']}",
            "Стало: {$change['to']}",
        ]);

        $this->info("Обновлено: {$change['from']} → {$change['to']}");

        SendTelegramMessageJob::dispatchSync($message, [
            'type' => 'waiting_discount_delivery_date_advanced',
            'from' => $change['from'],
            'to' => $change['to'],
        ]);

        $this->info('Уведомление отправлено в Telegram.');

        return self::SUCCESS;
    }
}
