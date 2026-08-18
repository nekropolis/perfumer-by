<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Services\ProductViewService;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Throwable;

class RefreshHomeRecommendedCommand extends Command
{
    protected $signature = 'catalog:refresh-home-recommended';

    protected $description = 'Собрать недельный снимок 8 самых открываемых товаров за 30 дней для главной';

    public function handle(ProductViewService $productViewService): int
    {
        $this->info('Сбор снимка рекомендуемых товаров...');

        try {
            $count = $productViewService->refreshSnapshot();
            $ids = $productViewService->snapshotProductIds();
        } catch (Throwable $e) {
            $this->error($e->getMessage());
            $this->notifyTelegram(
                implode("\n", [
                    '⚠️ Ошибка обновления рекомендуемых на главной',
                    'Команда: catalog:refresh-home-recommended',
                    'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
                    'Ошибка: '.$e->getMessage(),
                ]),
                ['type' => 'catalog_refresh_home_recommended_error'],
            );

            return self::FAILURE;
        }

        $this->info('Снимок рекомендуемых обновлён: '.$count.' товаров.');

        $lines = [
            '✅ Рекомендуемые на главной обновлены',
            'Команда: catalog:refresh-home-recommended',
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
            'Товаров в снимке: '.$count,
        ];
        if ($ids !== []) {
            $lines[] = 'ID: '.implode(', ', $ids);
        }

        $this->notifyTelegram(implode("\n", $lines), [
            'type' => 'catalog_refresh_home_recommended_done',
            'count' => $count,
        ]);

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function notifyTelegram(string $message, array $context): void
    {
        try {
            SendTelegramMessageJob::dispatchSync($message, $context);
            $this->info('Уведомление отправлено в Telegram.');
        } catch (Throwable $e) {
            $this->warn('Не удалось отправить уведомление в Telegram: '.$e->getMessage());
        }
    }
}
