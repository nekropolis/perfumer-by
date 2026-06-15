<?php

namespace Modules\Catalog\Services\SmartSearch;

use Modules\Catalog\Models\Product;
use Modules\Catalog\Jobs\SyncProductSearchIndexJob;

class ProductSearchIndexer
{
    private static int $settingsSyncedAtTs = 0;

    public function __construct(
        private readonly MeiliSearchHttpClient $client,
        private readonly ProductSearchDocumentBuilder $documentBuilder
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->client->enabled();
    }

    public function indexName(): string
    {
        return (string) config('services.catalog_search.meilisearch.index', 'catalog_products');
    }

    public function ensureIndexConfigured(): void
    {
        if (!$this->isEnabled()) {
            return;
        }

        $syncTtl = 300;
        if ((time() - self::$settingsSyncedAtTs) < $syncTtl) {
            return;
        }

        $index = $this->indexName();
        try {
            $this->client->get('/indexes/'.$index);
        } catch (\RuntimeException) {
            $this->client->post('/indexes', [
                'uid' => $index,
                'primaryKey' => 'id',
            ]);
        }

        $this->client->request('PATCH', "/indexes/{$index}/settings", [
            'searchableAttributes' => [
                'display_title',
                'name',
                'brand_name',
                'variant_labels',
                'slug',
            ],
            'filterableAttributes' => [
                'is_active',
                'has_stock',
                'is_preorder_available',
                'is_out_of_stock',
            ],
            'sortableAttributes' => [
                'updated_at_ts',
                'min_price',
            ],
            'rankingRules' => [
                'words',
                'typo',
                'proximity',
                'attribute',
                'sort',
                'exactness',
            ],
            'typoTolerance' => [
                'enabled' => true,
                'disableOnWords' => [],
                'disableOnAttributes' => ['slug'],
                'minWordSizeForTypos' => [
                    'oneTypo' => 3,
                    'twoTypos' => 7,
                ],
            ],
        ]);
        self::$settingsSyncedAtTs = time();
    }

    public function syncProduct(Product $product): void
    {
        if (!$this->isEnabled()) {
            return;
        }

        if (!$product->is_active) {
            $this->deleteProductById((int) $product->id);

            return;
        }

        $this->ensureIndexConfigured();

        $product->loadMissing([
            'brand:id,name,slug',
            'variants' => static function ($query): void {
                $query->select('id', 'product_id', 'variant_definition_id', 'price', 'stock', 'is_preorder')
                    ->with(['definition:id,title']);
            },
            'activeVariants:id,product_id,stock,is_preorder',
        ]);

        $this->client->post('/indexes/'.$this->indexName().'/documents', [
            $this->documentBuilder->build($product),
        ]);
    }

    public function queueProductSync(int $productId, bool $forceSync = false): void
    {
        if (!$this->isEnabled() || $productId <= 0) {
            return;
        }

        $run = function () use ($productId, $forceSync): void {
            if (!$forceSync && (bool) config('services.catalog_search.async_updates', true)) {
                SyncProductSearchIndexJob::dispatch($productId, false);

                return;
            }

            $product = Product::query()->find($productId);
            if ($product === null) {
                $this->deleteProductById($productId);

                return;
            }

            $this->syncProduct($product);
        };

        if (\Illuminate\Support\Facades\DB::transactionLevel() > 0) {
            \Illuminate\Support\Facades\DB::afterCommit($run);

            return;
        }

        $run();
    }

    public function queueProductDelete(int $productId): void
    {
        if (!$this->isEnabled() || $productId <= 0) {
            return;
        }

        $run = function () use ($productId): void {
            if ((bool) config('services.catalog_search.async_updates', true)) {
                SyncProductSearchIndexJob::dispatch($productId, true);

                return;
            }

            $this->deleteProductById($productId);
        };

        if (\Illuminate\Support\Facades\DB::transactionLevel() > 0) {
            \Illuminate\Support\Facades\DB::afterCommit($run);

            return;
        }

        $run();
    }

    public function deleteProductById(int $productId): void
    {
        if (!$this->isEnabled() || $productId <= 0) {
            return;
        }

        $this->client->request('DELETE', '/indexes/'.$this->indexName().'/documents/'.$productId);
    }

    public function rebuildAll(int $chunkSize = 200): void
    {
        if (!$this->isEnabled()) {
            return;
        }

        $this->ensureIndexConfigured();

        Product::query()
            ->where('is_active', true)
            ->with([
                'brand:id,name,slug',
                'variants' => static function ($query): void {
                    $query->select('id', 'product_id', 'variant_definition_id', 'price', 'stock', 'is_preorder')
                        ->with(['definition:id,title']);
                },
                'activeVariants:id,product_id,stock,is_preorder',
            ])
            ->chunkById(max(20, $chunkSize), function ($products): void {
                $documents = $products
                    ->map(fn (Product $product): array => $this->documentBuilder->build($product))
                    ->values()
                    ->all();

                if ($documents === []) {
                    return;
                }

                $this->client->post('/indexes/'.$this->indexName().'/documents', $documents);
            });
    }
}
