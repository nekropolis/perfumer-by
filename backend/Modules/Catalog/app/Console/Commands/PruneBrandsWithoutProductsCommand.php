<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Brand;

class PruneBrandsWithoutProductsCommand extends Command
{
    protected $signature = 'catalog:prune-brands-without-products';

    protected $description = 'Показать бренды без товаров; при подтверждении yes — удалить их из базы';

    public function handle(): int
    {
        $brands = Brand::query()
            ->doesntHave('products')
            ->orderBy('name')
            ->get(['id', 'name', 'slug']);

        if ($brands->isEmpty()) {
            $this->info('Брендов без товаров не найдено.');

            return self::SUCCESS;
        }

        $this->warn('Бренды без товаров ('.$brands->count().'):');
        $this->table(
            ['id', 'name', 'slug'],
            $brands->map(static fn (Brand $b) => [$b->id, $b->name, $b->slug])->all()
        );

        if (! $this->confirm('Удалить перечисленные бренды из базы?', false)) {
            $this->info('Удаление отменено.');

            return self::SUCCESS;
        }

        $ids = $brands->pluck('id')->all();

        $deleted = DB::transaction(static function () use ($ids): int {
            return Brand::query()->whereIn('id', $ids)->delete();
        });

        $this->info("Удалено брендов: {$deleted}");

        return self::SUCCESS;
    }
}
