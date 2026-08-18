<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Services\SimilarProductsService;
use Modules\Communications\Jobs\SendTelegramMessageJob;
use Throwable;

class RefreshProductSimilarsCommand extends Command
{
    protected $signature = 'catalog:refresh-product-similars {--chunk=50 : Размер пачки}';

    protected $description = 'Пересчитать похожие товары для всех активных карточек';

    public function handle(SimilarProductsService $similarProductsService): int
    {
        $chunk = max(1, (int) $this->option('chunk'));
        $this->info("Пересчёт похожих товаров (chunk={$chunk})...");

        $startedAt = now('Europe/Minsk');
        $updated = 0;
        $errors = [];
        $errorNotices = 0;

        try {
            Product::query()
                ->where('is_active', true)
                ->orderBy('id')
                ->chunkById($chunk, function ($products) use ($similarProductsService, &$updated, &$errors, &$errorNotices): void {
                    foreach ($products as $product) {
                        try {
                            $similarProductsService->rebuildForProduct((int) $product->id);
                            $updated++;
                        } catch (Throwable $e) {
                            $line = '#'.$product->id.' '.$product->slug.': '.$e->getMessage();
                            $errors[] = $line;
                            $this->error($line);
                            if ($errorNotices >= 10) {
                                continue;
                            }
                            $errorNotices++;
                            $this->notifyTelegram(
                                implode("\n", [
                                    '⚠️ Ошибка пересчёта похожих товаров',
                                    'Команда: catalog:refresh-product-similars',
                                    'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
                                    'Товар: #'.$product->id.' '.$product->slug,
                                    'Ошибка: '.$e->getMessage(),
                                ]),
                                [
                                    'type' => 'catalog_refresh_product_similars_error',
                                    'product_id' => (int) $product->id,
                                ],
                            );
                        }
                    }
                });
        } catch (Throwable $e) {
            $this->error($e->getMessage());
            $this->notifyTelegram(
                implode("\n", [
                    '⚠️ Пересчёт похожих товаров прерван',
                    'Команда: catalog:refresh-product-similars',
                    'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
                    'Обработано до сбоя: '.$updated,
                    'Ошибка: '.$e->getMessage(),
                ]),
                [
                    'type' => 'catalog_refresh_product_similars_failed',
                ],
            );

            return self::FAILURE;
        }

        $elapsed = $startedAt->diffInSeconds(now('Europe/Minsk'));
        $summary = sprintf(
            'Готово. Обработано товаров: %d. Ошибок: %d. Время: %d с.',
            $updated,
            count($errors),
            $elapsed,
        );
        $this->info($summary);

        $doneLines = [
            (count($errors) > 0 ? '⚠️' : '✅').' Пересчёт похожих товаров завершён',
            'Команда: catalog:refresh-product-similars',
            'Время: '.now('Europe/Minsk')->format('Y-m-d H:i:s').' (Europe/Minsk)',
            'Обработано: '.$updated,
            'Ошибок: '.count($errors),
            'Длительность: '.$elapsed.' с',
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
