<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;

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

    protected $description = 'Починить SEO-заглушки в name и заменить h1 со словом «купить» на бренд + название';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $this->info('Режим dry-run: изменения в БД не применяются.');
        }

        $nameUpdates = $this->collectBrokenNameUpdates();
        $h1Updates = $this->collectH1WithKupitUpdates($nameUpdates);

        $this->printNameReport($nameUpdates);
        $this->printH1Report($h1Updates);

        $nameChangeCount = count($nameUpdates['change']);
        $h1ChangeCount = count($h1Updates['change']);
        $noBrandCount = count($nameUpdates['no_brand']) + count($h1Updates['no_brand']);

        if ($dryRun || ($nameChangeCount === 0 && $h1ChangeCount === 0)) {
            $this->newLine();
            $this->line(sprintf(
                'Итого: name %d, h1 %d, без бренда %d',
                $nameChangeCount,
                $h1ChangeCount,
                $noBrandCount
            ));

            return self::SUCCESS;
        }

        $updatedNames = 0;
        $updatedH1 = 0;

        DB::transaction(function () use ($nameUpdates, $h1Updates, &$updatedNames, &$updatedH1): void {
            foreach ($nameUpdates['change'] as $row) {
                Product::query()->whereKey((int) $row['id'])->update([
                    'name' => $row['new_name'],
                ]);
                $updatedNames++;
            }

            foreach ($h1Updates['change'] as $row) {
                Product::query()->whereKey((int) $row['id'])->update([
                    'h1' => $row['new_h1'],
                ]);
                $updatedH1++;
            }
        });

        $this->info("Обновлено name: {$updatedNames}, h1: {$updatedH1}");

        return self::SUCCESS;
    }

    /**
     * @return array{change: list<array{id:int,old_name:string,new_name:string,brand:string}>, no_brand: list<array{id:int,name:string,h1:string}>}
     */
    private function collectBrokenNameUpdates(): array
    {
        $products = Product::query()
            ->with('brand:id,name')
            ->whereIn('name', self::BROKEN_NAMES)
            ->orderBy('id')
            ->get(['id', 'brand_id', 'name', 'h1']);

        $change = [];
        $noBrand = [];

        foreach ($products as $product) {
            $brandName = trim((string) ($product->brand?->name ?? ''));
            $currentName = trim((string) $product->name);

            if ($brandName === '') {
                $noBrand[] = [
                    'id' => (int) $product->id,
                    'name' => $currentName,
                    'h1' => trim((string) ($product->h1 ?? '')) ?: '—',
                ];

                continue;
            }

            if (mb_strtolower($currentName, 'UTF-8') === mb_strtolower($brandName, 'UTF-8')) {
                continue;
            }

            $change[] = [
                'id' => (int) $product->id,
                'old_name' => $currentName,
                'new_name' => $brandName,
                'brand' => $brandName,
            ];
        }

        return ['change' => $change, 'no_brand' => $noBrand];
    }

    /**
     * @param  array{change: list<array{id:int,old_name:string,new_name:string,brand:string}>, no_brand: list<array{id:int,name:string,h1:string}>}  $nameUpdates
     * @return array{change: list<array{id:int,name:string,old_h1:string,new_h1:string,brand:string}>, no_brand: list<array{id:int,name:string,h1:string}>}
     */
    private function collectH1WithKupitUpdates(array $nameUpdates): array
    {
        $nameById = [];
        foreach ($nameUpdates['change'] as $row) {
            $nameById[(int) $row['id']] = $row['new_name'];
        }

        $products = Product::query()
            ->with('brand:id,name')
            ->where('h1', 'like', '%купить%')
            ->orderBy('id')
            ->get(['id', 'brand_id', 'name', 'h1']);

        $change = [];
        $noBrand = [];

        foreach ($products as $product) {
            $id = (int) $product->id;
            $brandName = trim((string) ($product->brand?->name ?? ''));
            $currentName = $nameById[$id] ?? trim((string) $product->name);
            $currentH1 = trim((string) ($product->h1 ?? ''));

            if ($brandName === '') {
                $noBrand[] = [
                    'id' => $id,
                    'name' => $currentName,
                    'h1' => $currentH1 ?: '—',
                ];

                continue;
            }

            $newH1 = ProductDisplayName::format($brandName, $currentName);
            if ($newH1 === '' || mb_strtolower($newH1, 'UTF-8') === mb_strtolower($currentH1, 'UTF-8')) {
                continue;
            }

            $change[] = [
                'id' => $id,
                'name' => $currentName,
                'old_h1' => $currentH1 ?: '—',
                'new_h1' => $newH1,
                'brand' => $brandName,
            ];
        }

        return ['change' => $change, 'no_brand' => $noBrand];
    }

    /**
     * @param  array{change: list<array{id:int,old_name:string,new_name:string,brand:string}>, no_brand: list<array{id:int,name:string,h1:string}>}  $nameUpdates
     */
    private function printNameReport(array $nameUpdates): void
    {
        if ($nameUpdates['change'] !== []) {
            $this->newLine();
            $this->info('Name — будут обновлены ('.count($nameUpdates['change']).'):');
            $this->table(
                ['id', 'name (было)', 'name (станет)', 'brand'],
                array_map(
                    static fn (array $row): array => [$row['id'], $row['old_name'], $row['new_name'], $row['brand']],
                    $nameUpdates['change']
                )
            );
        } else {
            $this->info('Name: нет товаров с SEO-заглушкой.');
        }

        if ($nameUpdates['no_brand'] !== []) {
            $this->warn('Name без бренда — пропуск ('.count($nameUpdates['no_brand']).'):');
            $this->table(
                ['id', 'name', 'h1'],
                array_map(
                    static fn (array $row): array => [$row['id'], $row['name'], $row['h1']],
                    $nameUpdates['no_brand']
                )
            );
        }
    }

    /**
     * @param  array{change: list<array{id:int,name:string,old_h1:string,new_h1:string,brand:string}>, no_brand: list<array{id:int,name:string,h1:string}>}  $h1Updates
     */
    private function printH1Report(array $h1Updates): void
    {
        if ($h1Updates['change'] !== []) {
            $this->newLine();
            $this->info('H1 со словом «купить» — будут обновлены ('.count($h1Updates['change']).'):');
            $this->table(
                ['id', 'name', 'h1 (было)', 'h1 (станет)', 'brand'],
                array_map(
                    static fn (array $row): array => [$row['id'], $row['name'], $row['old_h1'], $row['new_h1'], $row['brand']],
                    $h1Updates['change']
                )
            );
        } else {
            $this->info('H1: нет товаров со словом «купить».');
        }

        if ($h1Updates['no_brand'] !== []) {
            $this->warn('H1 без бренда — пропуск ('.count($h1Updates['no_brand']).'):');
            $this->table(
                ['id', 'name', 'h1'],
                array_map(
                    static fn (array $row): array => [$row['id'], $row['name'], $row['h1']],
                    $h1Updates['no_brand']
                )
            );
        }
    }
}
