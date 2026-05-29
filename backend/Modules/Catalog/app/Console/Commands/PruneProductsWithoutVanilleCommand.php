<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Models\SupplierProduct;
use Modules\Catalog\Services\SmartSearch\ProductSearchIndexer;

class PruneProductsWithoutVanilleCommand extends Command
{
    protected $signature = 'catalog:prune-products-without-vanille
        {--dry-run : Только показать список}
        {--limit= : Максимум удалений за запуск}
        {--force : Без подтверждения}';

    protected $description = 'Удалить товары без Vanille или пустые (0 вариантов и 0 атрибутов)';

    public function handle(): int
    {
        $vanilleSupplierId = (int) Supplier::query()->where('code', 'vanille')->value('id');
        if ($vanilleSupplierId <= 0) {
            $this->error('Поставщик vanille не найден.');

            return self::FAILURE;
        }

        $query = Product::query()
            ->with(['brand:id,name,slug'])
            ->withCount(['variants', 'attributeValues'])
            ->where(function ($q) use ($vanilleSupplierId): void {
                $q->whereDoesntHave('supplierProducts', static function ($sp) use ($vanilleSupplierId): void {
                    $sp->where('supplier_id', $vanilleSupplierId);
                })->orWhere(function ($inner): void {
                    $inner->whereDoesntHave('variants')
                        ->whereDoesntHave('attributeValues');
                });
            })
            ->orderBy('id');

        $limit = $this->option('limit');
        if ($limit !== null && $limit !== '') {
            $query->limit(max(1, (int) $limit));
        }

        $products = $query->get(['id', 'brand_id', 'name', 'slug']);
        if ($products->isEmpty()) {
            $this->info('Мусорных товаров не найдено.');

            return self::SUCCESS;
        }

        $this->warn('Товаров к удалению: ' . $products->count());
        $this->table(
            ['id', 'brand', 'name', 'slug', 'vanille', 'variants', 'attrs'],
            $products->map(function (Product $p) use ($vanilleSupplierId) {
                $hasVanille = SupplierProduct::query()
                    ->where('supplier_id', $vanilleSupplierId)
                    ->where('product_id', $p->id)
                    ->exists();

                return [
                    $p->id,
                    $p->brand?->name ?? '—',
                    $p->name,
                    $p->slug,
                    $hasVanille ? 'да' : 'нет',
                    (int) ($p->variants_count ?? 0),
                    (int) ($p->attribute_values_count ?? 0),
                ];
            })->all(),
        );

        if ((bool) $this->option('dry-run')) {
            $this->info('Dry-run: удаление не выполнялось.');
            $this->line('После удаления: php artisan catalog:prune-brands-without-products');

            return self::SUCCESS;
        }

        if (!(bool) $this->option('force') && !$this->confirm('Удалить эти товары?', false)) {
            $this->info('Отменено.');

            return self::SUCCESS;
        }

        $deleted = 0;
        $searchEnabled = (bool) config('services.catalog_search.enabled', false);
        $indexer = $searchEnabled ? app(ProductSearchIndexer::class) : null;

        foreach ($products as $product) {
            DB::transaction(function () use ($product, $vanilleSupplierId, $indexer, &$deleted): void {
                $productId = (int) $product->id;

                SupplierProduct::query()
                    ->where('supplier_id', $vanilleSupplierId)
                    ->where('product_id', $productId)
                    ->delete();

                $product->delete();
                $indexer?->deleteProductById($productId);
                $deleted++;
            });
        }

        $this->info("Удалено товаров: {$deleted}");
        $this->line('Пустые бренды: php artisan catalog:prune-brands-without-products');

        return self::SUCCESS;
    }
}
