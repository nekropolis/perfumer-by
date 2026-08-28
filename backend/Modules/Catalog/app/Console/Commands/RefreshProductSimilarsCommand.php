<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Services\SimilarProductsService;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Throwable;

class RefreshProductSimilarsCommand extends Command
{
    protected $signature = 'catalog:refresh-product-similars {--chunk=200 : Размер пачки записи связей}';

    protected $description = 'Пересчитать похожие товары для всех активных карточек';

    public function handle(SimilarProductsService $similarProductsService): int
    {
        $writeBatch = max(1, (int) $this->option('chunk'));
        $this->info("Пересчёт похожих товаров (write-batch={$writeBatch})...");

        $startedAt = now('Europe/Minsk');
        $updated = 0;
        $errors = [];
        $errorNotices = 0;

        try {
            $result = $similarProductsService->rebuildAll($writeBatch);
            $updated = $result['updated'];
            $errors = $result['errors'];

            foreach (array_slice($errors, 0, 10) as $error) {
                $this->error($error);
                if ($errorNotices >= 10) {
                    continue;
                }
                $errorNotices++;
                $this->notifyTelegram(
                    implode("\n", [
                        '⚠️ Ошибка пересчёта похожих товаров',
                        'Команда: catalog:refresh-product-similars',
                        'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
                        'Ошибка: '.$error,
                    ]),
                    [
                        'type' => 'catalog_refresh_product_similars_error',
                    ],
                );
            }
        } catch (Throwable $e) {
            $this->error($e->getMessage());
            $this->notifyTelegram(
                implode("\n", [
                    '⚠️ Пересчёт похожих товаров прерван',
                    'Команда: catalog:refresh-product-similars',
                    'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
                    'Обработано до сбоя: '.$updated,
                    'Длительность: '.$this->formatDuration($startedAt),
                    'Ошибка: '.$e->getMessage(),
                ]),
                [
                    'type' => 'catalog_refresh_product_similars_failed',
                ],
            );

            return self::FAILURE;
        }

        $duration = $this->formatDuration($startedAt);
        $this->info(sprintf(
            'Готово. Обработано товаров: %d. Ошибок: %d. Длительность: %s.',
            $updated,
            count($errors),
            $duration,
        ));

        $doneLines = [
            (count($errors) > 0 ? '⚠️' : '✅').' Пересчёт похожих товаров завершён',
            'Команда: catalog:refresh-product-similars',
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
            'Обработано: '.$updated,
            'Ошибок: '.count($errors),
            'Длительность: '.$duration,
        ];
        if ($errors !== []) {
            $doneLines[] = '';
            $doneLines[] = 'Последние ошибки:';
            foreach (array_slice($errors, 0, 15) as $error) {
                $doneLines[] = $error;
            }
            if (count($errors) > 15) {
                $doneLines[] = '… и ещё '.(count($errors) - 15);
            }
        }

        $this->notifyTelegram(implode("\n", $doneLines), [
            'type' => 'catalog_refresh_product_similars_done',
            'updated' => $updated,
            'errors' => count($errors),
        ]);

        return $errors === [] ? self::SUCCESS : self::FAILURE;
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
