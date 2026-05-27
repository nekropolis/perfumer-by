<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Support\VanilleCatalogListingImageOrder;

class RepairVanilleCatalogImageOrderCommand extends Command
{
    protected $signature = 'catalog:repair-vanille-catalog-image-order
        {--dry-run : Только показать, без записи в БД}
        {--product-id= : Только один product_id}
        {--limit=0 : Лимит товаров (0 = все)}
        {--show-each : Печатать каждый исправленный товар}';

    protected $description = 'Поменять местами перепутанные каталожные фото Vanille (-2 было главным, -1 вторым)';

    public function handle(): int
    {
        if (! Schema::hasColumn('product_images', 'usage_type')) {
            $this->error('Колонка product_images.usage_type отсутствует — команда не применима.');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $verbose = (bool) $this->option('show-each');
        $limit = max(0, (int) $this->option('limit'));
        $productId = $this->option('product-id');
        $productId = $productId !== null && $productId !== '' ? (int) $productId : null;

        $query = ProductImage::query()
            ->select('product_id')
            ->where('usage_type', ProductImage::USAGE_CATALOG)
            ->groupBy('product_id')
            ->havingRaw('COUNT(*) = 2')
            ->orderBy('product_id');

        if ($productId !== null && $productId > 0) {
            $query->where('product_id', $productId);
        }

        if ($limit > 0) {
            $query->limit($limit);
        }

        $productIds = $query
            ->pluck('product_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($productIds === []) {
            $this->info('Товаров с двумя каталожными фото не найдено.');

            return self::SUCCESS;
        }

        $this->info(sprintf(
            'Проверяем %d товар(ов)%s…',
            count($productIds),
            $dryRun ? ' (dry-run)' : '',
        ));

        $fixed = 0;
        $skipped = 0;
        $bar = $this->output->createProgressBar(count($productIds));
        $bar->start();

        foreach ($productIds as $id) {
            $images = ProductImage::query()
                ->where('product_id', $id)
                ->where('usage_type', ProductImage::USAGE_CATALOG)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
                ->all();

            if (! VanilleCatalogListingImageOrder::needsSwap($images)) {
                $skipped++;
                $bar->advance();
                continue;
            }

            $pair = VanilleCatalogListingImageOrder::resolvePair($images);
            if ($pair === null) {
                $skipped++;
                $bar->advance();
                continue;
            }

            /** @var ProductImage $primary */
            $primary = $pair['primary'];
            /** @var ProductImage $secondary */
            $secondary = $pair['secondary'];

            $sortPrimary = min($primary->sort_order, $secondary->sort_order);
            $sortSecondary = max($primary->sort_order, $secondary->sort_order);

            if ($verbose) {
                $bar->clear();
                $this->line(sprintf(
                    '%s product_id=%d: main %s -> %s | hover %s -> %s',
                    $dryRun ? '[dry-run]' : '[fix]',
                    $id,
                    basename(VanilleCatalogListingImageOrder::reference($secondary)),
                    basename(VanilleCatalogListingImageOrder::reference($primary)),
                    basename(VanilleCatalogListingImageOrder::reference($primary)),
                    basename(VanilleCatalogListingImageOrder::reference($secondary)),
                ));
                $bar->display();
            }

            if (! $dryRun) {
                DB::transaction(function () use ($primary, $secondary, $sortPrimary, $sortSecondary, $id): void {
                    ProductImage::query()
                        ->where('product_id', $id)
                        ->where('is_main', true)
                        ->update(['is_main' => false]);

                    $primary->update([
                        'is_main' => true,
                        'sort_order' => $sortPrimary,
                    ]);
                    $secondary->update([
                        'is_main' => false,
                        'sort_order' => $sortSecondary,
                    ]);
                });
            }

            $fixed++;
            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);
        $this->info(sprintf(
            'Готово: исправлено %d, пропущено %d, проверено %d%s',
            $fixed,
            $skipped,
            count($productIds),
            $dryRun ? ' (dry-run)' : '',
        ));

        return self::SUCCESS;
    }
}
