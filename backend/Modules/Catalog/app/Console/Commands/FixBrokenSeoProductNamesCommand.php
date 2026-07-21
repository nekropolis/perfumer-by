<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;

class FixBrokenSeoProductNamesCommand extends Command
{
    public const BROKEN_NAMES = [
        'Аромат купить в Минске и Беларуси, цена',
        'Купить аромат в Минске и Беларуси, цена',
        'Купить туалетную воду Jesus Del Pozo в Минске, цена',
        'купить в Минске и Беларуси, цена',
        '0 купить в Минске и Беларуси, цена',
    ];

    protected $signature = 'catalog:products:fix-broken-seo-names
                            {--dry-run : Показать изменения без записи в БД}';

    protected $description = 'Заменить SEO-заглушку в products.name на бренд и дописать бренд в начало h1';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $this->info('Режим dry-run: изменения в БД не применяются.');
        }

        $products = Product::query()
            ->with('brand:id,name')
            ->whereIn('name', self::BROKEN_NAMES)
            ->orderBy('id')
            ->get(['id', 'brand_id', 'name', 'h1']);

        if ($products->isEmpty()) {
            $this->info('Товаров с SEO-заглушкой в name не найдено.');

            return self::SUCCESS;
        }

        $wouldChange = [];
        $noBrand = [];

        foreach ($products as $product) {
            $brandName = trim((string) ($product->brand?->name ?? ''));
            $currentName = trim((string) $product->name);
            $currentH1 = trim((string) ($product->h1 ?? ''));

            if ($brandName === '') {
                $noBrand[] = [$product->id, $currentName, $currentH1 ?: '—'];

                continue;
            }

            $newName = $brandName;
            $newH1 = $currentH1 === ''
                ? $brandName
                : $brandName.' '.$currentH1;

            $wouldChange[] = [
                $product->id,
                $currentName,
                $newName,
                $currentH1 ?: '—',
                $newH1,
                $brandName,
            ];
        }

        if ($wouldChange !== []) {
            $this->newLine();
            $this->info('Будут обновлены ('.count($wouldChange).'):');
            $this->table(
                ['id', 'name (было)', 'name (станет)', 'h1 (было)', 'h1 (станет)', 'brand'],
                $wouldChange
            );
        } else {
            $this->info('Нет товаров для обновления.');
        }

        if ($noBrand !== []) {
            $this->warn('Без бренда — пропуск ('.count($noBrand).'):');
            $this->table(['id', 'name', 'h1'], $noBrand);
        }

        if ($dryRun || $wouldChange === []) {
            $this->newLine();
            $this->line('Итого: обновить '.count($wouldChange).', без бренда '.count($noBrand));

            return self::SUCCESS;
        }

        $updated = 0;
        DB::transaction(function () use ($wouldChange, &$updated): void {
            foreach ($wouldChange as $row) {
                $id = (int) $row[0];
                Product::query()->whereKey($id)->update([
                    'name' => (string) $row[2],
                    'h1' => (string) $row[4],
                ]);
                $updated++;
            }
        });

        $this->info("Обновлено товаров: {$updated}");

        return self::SUCCESS;
    }
}
