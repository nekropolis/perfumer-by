<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;

class StripBrandFromProductNamesCommand extends Command
{
    protected $signature = 'catalog:products:strip-brand-from-names
                            {--dry-run : Показать изменения без записи в БД}
                            {--update-slugs : Пересобрать slug как brand_slug-product_slug}';

    protected $description = 'Убрать название бренда из products.name; отчёт по товарам без совпадения';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $updateSlugs = (bool) $this->option('update-slugs');

        if ($dryRun) {
            $this->info('Режим dry-run: изменения в БД не применяются.');
        }

        $products = Product::query()
            ->with('brand:id,name,slug')
            ->orderBy('id')
            ->get(['id', 'brand_id', 'name', 'slug']);

        $wouldChange = [];
        $unchanged = [];
        $noBrand = [];
        $brandNotFound = [];

        foreach ($products as $product) {
            $brandName = trim((string) ($product->brand?->name ?? ''));
            $currentName = trim((string) $product->name);

            if ($brandName === '') {
                $noBrand[] = [$product->id, $currentName, '—', 'нет бренда'];

                continue;
            }

            $strip = ProductDisplayName::stripBrandFromName($brandName, $currentName);
            if (!$strip['found']) {
                $brandNotFound[] = [$product->id, $currentName, $brandName, 'бренд не найден в name'];

                continue;
            }

            if (mb_strtolower($strip['name'], 'UTF-8') === mb_strtolower($currentName, 'UTF-8')) {
                $unchanged[] = [$product->id, $currentName, $brandName, 'уже без бренда'];

                continue;
            }

            $newSlug = null;
            if ($updateSlugs) {
                $product->name = $strip['name'];
                $newSlug = ProductDisplayName::resolveUniqueProductSlug(
                    ProductDisplayName::buildSlugForProduct($product),
                    (int) $product->id
                );
            }

            $wouldChange[] = [
                $product->id,
                $currentName,
                $strip['name'],
                $brandName,
                $updateSlugs ? (string) $product->slug.' → '.$newSlug : '—',
            ];
        }

        if ($wouldChange !== []) {
            $this->newLine();
            $this->info('Будут обновлены ('.count($wouldChange).'):');
            $this->table(
                ['id', 'name (было)', 'name (станет)', 'brand', 'slug'],
                $wouldChange
            );
        } else {
            $this->info('Нет товаров для обновления name.');
        }

        if ($unchanged !== []) {
            $this->warn('Без изменений name ('.count($unchanged).'):');
            $this->table(['id', 'name', 'brand', 'причина'], $unchanged);
        }

        if ($noBrand !== []) {
            $this->warn('Без бренда ('.count($noBrand).'):');
            $this->table(['id', 'name', 'brand', 'причина'], $noBrand);
        }

        if ($brandNotFound !== []) {
            $this->error('Бренд не найден в name ('.count($brandNotFound).'):');
            $this->table(['id', 'name', 'brand', 'причина'], $brandNotFound);
        }

        if ($dryRun || $wouldChange === []) {
            $this->newLine();
            $this->line('Итого: обновить '.count($wouldChange)
                .', без изменений '.count($unchanged)
                .', без бренда '.count($noBrand)
                .', бренд не в name '.count($brandNotFound));

            return self::SUCCESS;
        }

        $updated = 0;
        DB::transaction(function () use ($wouldChange, $updateSlugs, $products, &$updated): void {
            $byId = $products->keyBy('id');

            foreach ($wouldChange as $row) {
                $id = (int) $row[0];
                $newName = (string) $row[2];
                /** @var Product|null $product */
                $product = $byId->get($id);
                if ($product === null) {
                    continue;
                }

                $payload = ['name' => $newName];
                if ($updateSlugs) {
                    $product->name = $newName;
                    $payload['slug'] = ProductDisplayName::resolveUniqueProductSlug(
                        ProductDisplayName::buildSlugForProduct($product),
                        $id
                    );
                }

                Product::query()->whereKey($id)->update($payload);
                $updated++;
            }
        });

        $this->info("Обновлено товаров: {$updated}");
        if ($updateSlugs) {
            $this->warn('Slug изменены — проверьте редиректы legacy и переиндексируйте поиск: php artisan catalog:search:reindex');
        }

        return self::SUCCESS;
    }
}
