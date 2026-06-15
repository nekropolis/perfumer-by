<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;

class VanilleBrendyiTotalCommand extends Command
{
    protected $signature = 'catalog:vanille-brendyi-total
        {--compare : Сравнить с product_links.json и supplier_products}
        {--top=15 : Сколько брендов показать в топе (0 — не показывать)}';

    protected $description = 'Сумма счётчиков товаров на vanille.by/brendyi (для сверки с product_links.json)';

    public function handle(VanilleBrandParser $brandParser): int
    {
        $this->info('Загружаю vanille.by/brendyi …');

        try {
            $stats = $brandParser->parseBrendyiProductCounts();
        } catch (\Throwable $e) {
            $this->error('Не удалось загрузить /brendyi: ' . $e->getMessage());

            return self::FAILURE;
        }

        $this->table(
            ['Метрика', 'Значение'],
            [
                ['Уникальных брендов (slug)', (string) $stats['unique_brands']],
                ['Сумма счётчиков (уникальный slug)', number_format((int) $stats['total_product_count'], 0, '', ' ')],
                ['Сумма всех span на странице', number_format((int) $stats['total_including_duplicate_slugs'], 0, '', ' ')],
                ['Повторов slug на странице', (string) $stats['duplicate_slug_entries']],
            ],
        );

        $top = max(0, (int) $this->option('top'));
        if ($top > 0 && $stats['brands'] !== []) {
            $this->newLine();
            $this->info("Топ {$top} брендов по счётчику:");
            $this->table(
                ['Бренд', 'Slug', 'Товаров'],
                array_map(
                    static fn (array $row): array => [
                        (string) $row['name'],
                        (string) $row['slug'],
                        (string) $row['count'],
                    ],
                    array_slice($stats['brands'], 0, $top),
                ),
            );
        }

        if ($this->option('compare')) {
            $this->printLocalComparison((int) $stats['total_product_count']);
        } else {
            $this->line('Подсказка: php artisan catalog:vanille-brendyi-total --compare');
        }

        return self::SUCCESS;
    }

    private function printLocalComparison(int $vanilleTotal): void
    {
        $this->newLine();
        $this->info('Локальная сверка:');

        $linksPath = storage_path('app/public/imports/vanille/product_links.json');
        $linksCount = 0;
        if (is_file($linksPath)) {
            $decoded = json_decode((string) file_get_contents($linksPath), true);
            $linksCount = is_array($decoded) ? count($decoded) : 0;
        }

        $supplier = Supplier::query()->where('code', 'vanille')->first();
        $supplierCount = $supplier
            ? SupplierProduct::query()->where('supplier_id', $supplier->id)->count()
            : 0;

        $rows = [
            ['product_links.json', $linksCount > 0 ? number_format($linksCount, 0, '', ' ') : '—'],
            ['supplier_products (vanille)', $supplierCount > 0 ? number_format($supplierCount, 0, '', ' ') : '—'],
            ['vanille.by /brendyi (сумма)', number_format($vanilleTotal, 0, '', ' ')],
        ];

        if ($vanilleTotal > 0) {
            if ($linksCount > 0) {
                $rows[] = ['product_links vs brendyi', $this->formatDelta($linksCount, $vanilleTotal)];
            }
            if ($supplierCount > 0) {
                $rows[] = ['supplier_products vs brendyi', $this->formatDelta($supplierCount, $vanilleTotal)];
            }
        }

        $this->table(['Источник', 'Количество'], $rows);

        if ($linksCount > 0 && $vanilleTotal > 0 && $linksCount < (int) floor($vanilleTotal * 0.9)) {
            $this->warn('product_links.json заметно меньше суммы на /brendyi — проверьте сбор ссылок (listing API, DDoS-Guard UA).');
        }
    }

    private function formatDelta(int $actual, int $expected): string
    {
        $pct = round(($actual / $expected) * 100, 1);
        $diff = $actual - $expected;
        $sign = $diff >= 0 ? '+' : '';

        return sprintf('%s%% (%s%s)', $pct, $sign, number_format($diff, 0, '', ' '));
    }
}
