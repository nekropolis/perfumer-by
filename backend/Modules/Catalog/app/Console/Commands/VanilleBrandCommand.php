<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Vanille\Support\VanilleBrandLinkService;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class VanilleBrandCommand extends Command
{
    protected $signature = 'catalog:vanille-brand
        {brandSlug : Slug бренда на Vanille, напр. dolce-i-gabbana}
        {action=preflight : preflight|collect|status|parse|run}
        {--expected= : Ожидаемое число карточек на листинге (напр. 121)}
        {--min=1 : Минимум собранных ссылок для успешного preflight}
        {--limit=20 : Размер пачки parse}
        {--force : Пропустить failed preflight (не рекомендуется)}';

    protected $description = 'Preflight, сбор ссылок и парсинг одного бренда Vanille (без полного 7-часового пайплайна)';

    public function handle(VanilleBrandLinkService $brandLinks, VanilleImportService $import): int
    {
        $slug = mb_strtolower(trim((string) $this->argument('brandSlug')), 'UTF-8');
        $action = (string) $this->argument('action');
        $expected = $this->option('expected');
        $expectedInt = $expected !== null && $expected !== '' ? max(1, (int) $expected) : null;
        $min = max(1, (int) $this->option('min'));

        return match ($action) {
            'preflight' => $this->runPreflight($brandLinks, $slug, $expectedInt, $min),
            'collect' => $this->runCollect($brandLinks, $slug, $expectedInt, $min),
            'status' => $this->runStatus($brandLinks, $slug),
            'parse' => $this->runParse($brandLinks, $import, $slug, $expectedInt, $min),
            'run' => $this->runFull($brandLinks, $import, $slug, $expectedInt, $min),
            default => $this->fail("Unknown action: {$action}. Use: preflight|collect|status|parse|run"),
        };
    }

    protected function runPreflight(
        VanilleBrandLinkService $brandLinks,
        string $slug,
        ?int $expected,
        int $min,
    ): int {
        $report = $brandLinks->preflight($slug, $expected, $min);
        $this->printPreflightReport($report);

        return ($report['ok'] ?? false) ? self::SUCCESS : self::FAILURE;
    }

    protected function runCollect(
        VanilleBrandLinkService $brandLinks,
        string $slug,
        ?int $expected,
        int $min,
    ): int {
        $report = $brandLinks->preflight($slug, $expected, $min);
        $this->printPreflightReport($report);

        if (!($report['ok'] ?? false) && !$this->option('force')) {
            $this->error('Сбор отменён: preflight не прошёл. Исправьте проблемы или используйте --force.');

            return self::FAILURE;
        }

        $merge = $brandLinks->collectAndMerge($slug);
        foreach (($merge['log'] ?? []) as $line) {
            $this->line((string) $line);
        }

        $this->info(sprintf(
            'Собрано %d ссылок; удалено старых записей бренда: %d; product_links.json: %d URL.',
            (int) $merge['collected'],
            (int) $merge['removed'],
            (int) $merge['total_main'],
        ));
        $this->line('Файл бренда: ' . (string) $merge['brand_file']);

        return self::SUCCESS;
    }

    protected function runStatus(VanilleBrandLinkService $brandLinks, string $slug): int
    {
        $progress = $brandLinks->countBrandParseProgress($slug);
        $this->table(
            ['Метрика', 'Значение'],
            [
                ['Ссылки в product_links_brand_*', (string) $progress['collected']],
                ['Уже в parsed_urls.json', (string) $progress['parsed_in_file']],
                ['Ожидают парсинга', (string) $progress['pending']],
                ['В parse_errors.json', (string) $progress['errors']],
            ],
        );

        return self::SUCCESS;
    }

    protected function runParse(
        VanilleBrandLinkService $brandLinks,
        VanilleImportService $import,
        string $slug,
        ?int $expected,
        int $min,
    ): int {
        $brandFile = $brandLinks->brandLinksPath($slug);
        if (!is_file($brandFile)) {
            $this->warn('Нет файла ссылок бренда. Запускаю collect…');
            if ($this->runCollect($brandLinks, $slug, $expected, $min) !== self::SUCCESS) {
                return self::FAILURE;
            }
        }

        $progress = $brandLinks->countBrandParseProgress($slug);
        if ((int) $progress['pending'] === 0 && (int) $progress['errors'] === 0) {
            $this->info('Все ссылки бренда уже в parsed_urls.json.');

            return self::SUCCESS;
        }

        $this->info('Парсинг из: ' . $brandFile);
        $limit = max(1, (int) $this->option('limit'));
        $offset = 0;
        $iteration = 0;

        do {
            $iteration++;
            $result = $import->parseProducts(
                $offset,
                $limit,
                null,
                VanilleImportService::PARSE_PRODUCTS_MODE_NEW_ONLY,
                $brandFile,
            );

            foreach (($result['log'] ?? []) as $line) {
                $this->line((string) $line);
            }

            $batchErrors = (int) ($result['errors'] ?? 0);
            $nextOffset = (int) ($result['next_offset'] ?? ($offset + $limit));
            $done = (bool) ($result['done'] ?? true);
            $total = (int) ($result['total_links'] ?? 0);

            $this->info(sprintf(
                'Пачка #%d: ok=%d, errors=%d, progress=%d/%d',
                $iteration,
                (int) ($result['count'] ?? 0),
                $batchErrors,
                min($nextOffset, max($total, 1)),
                max($total, 1),
            ));

            if ($batchErrors > 0 && !$done) {
                $this->warn('Есть ошибки в пачке; продолжаем. Повтор: catalog:vanille-brand ' . $slug . ' parse');
            }

            $offset = $nextOffset;
        } while (!$done);

        $this->runStatus($brandLinks, $slug);

        $progress = $brandLinks->countBrandParseProgress($slug);
        if ((int) $progress['pending'] > 0 || (int) $progress['errors'] > 0) {
            $this->warn('Парсинг завершён не полностью. Проверьте parse_errors.json и запустите parse снова.');

            return self::FAILURE;
        }

        $this->info('Парсинг бренда завершён.');

        return self::SUCCESS;
    }

    protected function runFull(
        VanilleBrandLinkService $brandLinks,
        VanilleImportService $import,
        string $slug,
        ?int $expected,
        int $min,
    ): int {
        if ($this->runCollect($brandLinks, $slug, $expected, $min) !== self::SUCCESS) {
            return self::FAILURE;
        }

        return $this->runParse($brandLinks, $import, $slug, $expected, $min);
    }

    /**
     * @param  array<string, mixed>  $report
     */
    protected function printPreflightReport(array $report): void
    {
        $this->info('Preflight: ' . (string) ($report['brand_name'] ?? '') . ' (' . (string) ($report['brand_slug'] ?? '') . ')');
        $this->table(
            ['Проверка', 'Значение'],
            [
                ['Vanille mse2_total', (string) ($report['vanille_total'] ?? '—')],
                ['Собрано ссылок (listing API)', (string) ($report['collected'] ?? 0)],
                ['Ожидали', (string) ($report['expected'] ?? '—')],
                ['Неверное поле brand', (string) ($report['wrong_brand_labels'] ?? 0)],
                ['Тестовая карточка', $this->formatSample(
                    isset($report['sample_fetch_ok']) ? (bool) $report['sample_fetch_ok'] : null,
                    (string) ($report['sample_url'] ?? ''),
                )],
                ['OK', ($report['ok'] ?? false) ? 'да' : 'нет'],
            ],
        );

        foreach ((array) ($report['issues'] ?? []) as $issue) {
            $this->error((string) $issue);
        }

        foreach ((array) ($report['log'] ?? []) as $line) {
            $this->line((string) $line);
        }
    }

    protected function formatSample(?bool $ok, string $url): string
    {
        if ($ok === null) {
            return '—';
        }

        return ($ok ? 'OK' : 'FAIL') . ($url !== '' ? ' ' . $url : '');
    }
}
