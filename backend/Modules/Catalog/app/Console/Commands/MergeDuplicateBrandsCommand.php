<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;

class MergeDuplicateBrandsCommand extends Command
{
    protected $signature = 'catalog:merge-duplicate-brands
        {--dry-run : Только показать план}
        {--force : Без подтверждения}';

    protected $description = 'Объединить бренды с одинаковым именем (разные slug: apieu / a-pieu)';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $brands = Brand::query()
            ->withCount('products')
            ->orderBy('id')
            ->get(['id', 'name', 'slug']);

        /** @var array<string, list<Brand>> $groups */
        $groups = [];
        foreach ($brands as $brand) {
            $key = ProductDisplayName::brandEquivalentKey((string) $brand->name);
            if ($key === '') {
                continue;
            }
            $groups[$key][] = $brand;
        }

        $duplicateGroups = array_filter($groups, static fn (array $rows): bool => count($rows) > 1);
        if ($duplicateGroups === []) {
            $this->info('Дублей брендов не найдено.');

            return self::SUCCESS;
        }

        $plan = [];
        foreach ($duplicateGroups as $key => $rows) {
            $keeper = $this->pickKeeper($rows);
            $losers = array_values(array_filter($rows, static fn (Brand $b): bool => (int) $b->id !== (int) $keeper->id));

            foreach ($losers as $loser) {
                $plan[] = [
                    $key,
                    $keeper->id,
                    $keeper->slug,
                    (int) $keeper->products_count,
                    $loser->id,
                    $loser->slug,
                    (int) $loser->products_count,
                ];
            }
        }

        $this->warn('Групп дублей: ' . count($duplicateGroups) . ', слияний: ' . count($plan));
        $this->table(
            ['key', 'keep_id', 'keep_slug', 'keep_products', 'drop_id', 'drop_slug', 'drop_products'],
            $plan,
        );

        if ($dryRun) {
            $this->info('Dry-run: изменений не было.');

            return self::SUCCESS;
        }

        if (!(bool) $this->option('force') && !$this->confirm('Объединить бренды по плану?', false)) {
            $this->info('Отменено.');

            return self::SUCCESS;
        }

        $mergedProducts = 0;
        $deletedBrands = 0;

        foreach ($duplicateGroups as $rows) {
            $keeper = $this->pickKeeper($rows);
            $losers = array_values(array_filter($rows, static fn (Brand $b): bool => (int) $b->id !== (int) $keeper->id));

            foreach ($losers as $loser) {
                DB::transaction(function () use ($keeper, $loser, &$mergedProducts, &$deletedBrands): void {
                    $moved = Product::query()
                        ->where('brand_id', $loser->id)
                        ->update(['brand_id' => $keeper->id]);
                    $mergedProducts += $moved;

                    SupplierProduct::query()
                        ->where('brand_id', $loser->id)
                        ->update(['brand_id' => $keeper->id]);

                    Brand::query()->whereKey($loser->id)->delete();
                    $deletedBrands++;
                });
            }
        }

        $this->info("Перенесено товаров: {$mergedProducts}, удалено брендов: {$deletedBrands}");
        $this->line('Пустые дубли: php artisan catalog:prune-brands-without-products');

        return self::SUCCESS;
    }

    /**
     * @param  list<Brand>  $rows
     */
    private function pickKeeper(array $rows): Brand
    {
        usort($rows, function (Brand $a, Brand $b): int {
            $countDiff = (int) $b->products_count <=> (int) $a->products_count;
            if ($countDiff !== 0) {
                return $countDiff;
            }

            $aVanille = $this->vanilleSlugMatches($a);
            $bVanille = $this->vanilleSlugMatches($b);
            if ($aVanille !== $bVanille) {
                return $bVanille <=> $aVanille;
            }

            return (int) $a->id <=> (int) $b->id;
        });

        return $rows[0];
    }

    private function vanilleSlugMatches(Brand $brand): bool
    {
        $row = VanilleBrandParser::findCatalogBrandRow((string) $brand->name);

        return $row !== null && (string) ($row['slug'] ?? '') === (string) $brand->slug;
    }
}
