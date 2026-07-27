<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Allparfume\AllparfumeBrandSyncService;

class SyncAllparfumeBrandCommand extends Command
{
    protected $signature = 'allparfume:sync-brand
        {brand_slug? : Slug бренда на allparfume.by, например dolce_and_gabbana. Пусто + --all = все бренды}
        {--all : Синхронизировать все бренды с allparfume.by}
        {--limit-products=0 : Лимит карточек на бренд (0 = без лимита)}';

    protected $description = 'Собрать товары бренда (или всех брендов) с allparfume.by';

    public function handle(AllparfumeBrandSyncService $syncService): int
    {
        $all = (bool) $this->option('all');
        $brandSlug = trim((string) ($this->argument('brand_slug') ?? ''));
        $limitProducts = (int) $this->option('limit-products');
        $limit = $limitProducts > 0 ? $limitProducts : null;

        if ($all || $brandSlug === '') {
            if (! $all && $brandSlug === '') {
                $this->error('Укажите brand_slug или флаг --all');

                return self::FAILURE;
            }

            $this->info('Allparfume: синхронизация всех брендов сайта');
            if ($limit !== null) {
                $this->warn("Внимание: --limit-products={$limit} игнорируется для --all (полный sync бренда).");
            }

            try {
                $summary = $syncService->syncAllSiteBrands(function (array $progress): void {
                    $message = (string) ($progress['message'] ?? '');
                    if ($message !== '') {
                        $this->line($message);
                    }
                });
            } catch (\Throwable $e) {
                $this->error($e->getMessage());

                return self::FAILURE;
            }

            $this->newLine();
            $this->info('Готово.');
            $this->line('Брендов на сайте/в БД: '.(int) ($summary['brands'] ?? 0));
            $this->line('С сайта: '.(int) ($summary['discovered_from_site'] ?? 0));
            $this->line('Обработано брендов: '.(int) ($summary['processed_brands'] ?? 0));
            $this->line('Создано товаров: '.(int) ($summary['created_products'] ?? 0));
            $this->line('Обновлено товаров: '.(int) ($summary['updated_products'] ?? 0));
            $this->line('Вариантов: '.(int) ($summary['created_variants'] ?? 0));
            $this->line('Офферов: '.(int) ($summary['created_shop_offers'] ?? 0));
            $this->line('Ошибок: '.(int) ($summary['errors'] ?? 0));

            return self::SUCCESS;
        }

        $this->info("Allparfume: синхронизация бренда {$brandSlug}");
        if ($limit !== null) {
            $this->line("Ограничение карточек: {$limit}");
        }

        try {
            $stats = $syncService->syncBrand($brandSlug, $limit);
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Готово.');
        $this->line("Brand URL: {$stats['brand_url']}");
        $this->line('Найдено карточек: '.(int) $stats['discovered_products']);
        $this->line('Обработано карточек: '.(int) $stats['processed_products']);
        $this->line('Создано товаров: '.(int) $stats['created_products']);
        $this->line('Обновлено товаров: '.(int) $stats['updated_products']);
        $this->line('Создано вариантов: '.(int) $stats['created_variants']);
        $this->line('Создано офферов магазинов: '.(int) $stats['created_shop_offers']);

        if (! empty($stats['log']) && is_array($stats['log'])) {
            $this->newLine();
            $this->info('Лог:');
            foreach ($stats['log'] as $line) {
                $this->line(' - '.$line);
            }
        }

        return self::SUCCESS;
    }
}
