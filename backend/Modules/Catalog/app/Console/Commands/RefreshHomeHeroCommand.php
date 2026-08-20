<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Services\ProductViewService;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Modules\Settings\Services\ShopSettingService;
use Throwable;

class RefreshHomeHeroCommand extends Command
{
    protected $signature = 'catalog:refresh-home-hero {--force : Обновить даже если 3 дня ещё не прошли}';

    protected $description = 'Раз в 3 дня ночью выбрать для hero главной товар с максимумом просмотров (ничья — случайный)';

    public function handle(ProductViewService $productViewService, ShopSettingService $settings): int
    {
        $this->info('Обновление hero-товара на главной...');

        $startedAt = now('Europe/Minsk');
        $previousId = (int) $settings->get(ProductViewService::HOME_HERO_PRODUCT_ID_KEY, '0');
        $previousOn = (string) $settings->get(ProductViewService::HOME_HERO_SELECTED_ON_KEY, '');

        try {
            $productId = $productViewService->refreshHeroFeatured((bool) $this->option('force'));
        } catch (Throwable $e) {
            $this->error($e->getMessage());
            $this->notifyTelegram(
                implode("\n", [
                    '⚠️ Ошибка обновления hero на главной',
                    'Команда: catalog:refresh-home-hero',
                    'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
                    'Длительность: '.$this->formatDuration($startedAt),
                    'Ошибка: '.$e->getMessage(),
                ]),
                ['type' => 'catalog_refresh_home_hero_error'],
            );

            return self::FAILURE;
        }

        if ($productId === null) {
            $this->warn('Нет подходящих товаров для hero.');

            return self::SUCCESS;
        }

        $selectedOn = (string) $settings->get(ProductViewService::HOME_HERO_SELECTED_ON_KEY, '');
        $rotated = $previousOn !== $selectedOn || $previousId !== $productId;

        $this->info($rotated
            ? 'Hero-товар обновлён: #'.$productId
            : 'Hero без ротации (ещё не прошли 3 дня): #'.$productId);

        if ($rotated) {
            $this->notifyTelegram(implode("\n", [
                '✅ Hero на главной обновлён',
                'Команда: catalog:refresh-home-hero',
                'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
                'Товар ID: '.$productId,
                'Длительность: '.$this->formatDuration($startedAt),
            ]), [
                'type' => 'catalog_refresh_home_hero_done',
                'product_id' => $productId,
            ]);
        }

        return self::SUCCESS;
    }

    private function formatDuration(\DateTimeInterface $startedAt): string
    {
        $seconds = max(0, (int) round(now('Europe/Minsk')->diffInSeconds($startedAt, true)));
        $hours = intdiv($seconds, 3600);
        $minutes = intdiv($seconds % 3600, 60);

        return sprintf('%d ч %d мин %d с', $hours, $minutes, $seconds % 60);
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
