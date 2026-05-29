<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

/**
 * Простой сценарий Vanille: бренды → ссылки (listing) → парсинг карточек.
 */
class VanilleSyncCommand extends Command
{
    protected $signature = 'catalog:vanille-sync
        {step=status : status|brands|links|parse|all}
        {--once : Одна пачка links/parse и выход}
        {--limit=20 : Размер пачки parse}';

    protected $description = 'Vanille: brands.json → product_links.json → products_*.json';

    public function handle(VanilleImportService $service): int
    {
        return match ((string) $this->argument('step')) {
            'status' => $this->showStatus(),
            'brands' => $this->runBrands($service),
            'links' => $this->runLinks($service),
            'parse' => $this->runParse($service),
            'all' => $this->runAll($service),
            default => $this->fail('Шаг: status|brands|links|parse|all'),
        };
    }

    protected function showStatus(): int
    {
        $dir = storage_path('app/public/imports/vanille');
        $brands = is_file($dir . '/brands.json')
            ? count(json_decode((string) file_get_contents($dir . '/brands.json'), true) ?: [])
            : 0;
        $links = is_file($dir . '/product_links.json')
            ? count(json_decode((string) file_get_contents($dir . '/product_links.json'), true) ?: [])
            : 0;
        $parsed = is_file($dir . '/parsed_urls.json')
            ? count((array) (json_decode((string) file_get_contents($dir . '/parsed_urls.json'), true)['urls'] ?? []))
            : 0;
        $errors = is_file($dir . '/parse_errors.json')
            ? count((array) (json_decode((string) file_get_contents($dir . '/parse_errors.json'), true)['errors'] ?? []))
            : 0;

        $this->table(['Файл', 'Записей'], [
            ['brands.json', (string) $brands],
            ['product_links.json', (string) $links],
            ['parsed_urls.json', (string) $parsed],
            ['parse_errors.json', (string) $errors],
        ]);

        return self::SUCCESS;
    }

    protected function runBrands(VanilleImportService $service): int
    {
        $result = $service->parseBrands();
        foreach (($result['log'] ?? []) as $line) {
            $this->line((string) $line);
        }
        if (!($result['success'] ?? false)) {
            $this->error((string) ($result['message'] ?? 'Ошибка'));

            return self::FAILURE;
        }
        $this->info('brands.json: ' . (int) ($result['count'] ?? 0) . ' брендов (без категорий и мусора)');

        return self::SUCCESS;
    }

    protected function runLinks(VanilleImportService $service): int
    {
        $offset = 0;
        $limit = 1;
        $once = (bool) $this->option('once');

        do {
            $batch = $service->collectProductLinks($offset, $limit, null, true, $offset === 0);
            foreach (($batch['log'] ?? []) as $line) {
                $this->line((string) $line);
            }
            $offset = (int) ($batch['next_offset'] ?? ($offset + $limit));
            $done = (bool) ($batch['done'] ?? true);
            $this->info(sprintf(
                'Ссылки: %d URL, брендов обработано %d/%d',
                (int) ($batch['count'] ?? 0),
                (int) ($batch['processed_brands'] ?? 0),
                (int) ($batch['total_brands'] ?? 0),
            ));
            if ($done) {
                $this->info(sprintf(
                    'Финал: брендов в brands.json=%d, удалено пустых=%d, ссылок=%d',
                    (int) ($batch['brands_kept'] ?? 0),
                    (int) ($batch['brands_removed'] ?? 0),
                    (int) ($batch['links_kept'] ?? 0),
                ));
            }
        } while (!$done && !$once);

        return self::SUCCESS;
    }

    protected function runParse(VanilleImportService $service): int
    {
        $offset = 0;
        $limit = max(1, (int) $this->option('limit'));
        $once = (bool) $this->option('once');

        do {
            $batch = $service->parseProducts(
                $offset,
                $limit,
                null,
                VanilleImportService::PARSE_PRODUCTS_MODE_NEW_ONLY,
            );
            foreach (($batch['log'] ?? []) as $line) {
                $this->line((string) $line);
            }
            $offset = (int) ($batch['next_offset'] ?? ($offset + $limit));
            $done = (bool) ($batch['done'] ?? true);
            $this->info(sprintf(
                'Парсинг: %d/%d, ошибок в пачке: %d',
                min($offset, (int) ($batch['total_links'] ?? 0)),
                (int) ($batch['total_links'] ?? 0),
                (int) ($batch['errors'] ?? 0),
            ));
        } while (!$done && !$once);

        return self::SUCCESS;
    }

    protected function runAll(VanilleImportService $service): int
    {
        if ($this->runBrands($service) !== self::SUCCESS) {
            return self::FAILURE;
        }
        if ($this->runLinks($service) !== self::SUCCESS) {
            return self::FAILURE;
        }

        return $this->runParse($service);
    }
}
