<?php

namespace Modules\Catalog\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Modules\Catalog\Services\SmartSearch\ProductSearchIndexer;

class SyncProductSearchIndexJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 5;
    public int $timeout = 60;
    public bool $failOnTimeout = true;

    public function __construct(
        public int $productId,
        public bool $deleteOnly = false,
    ) {
        $this->onQueue((string) config('services.catalog_search.queue_name', 'default'));
    }

    public function handle(ProductSearchIndexer $indexer): void
    {
        if ($this->productId <= 0) {
            return;
        }

        if ($this->deleteOnly) {
            $indexer->deleteProductById($this->productId);

            return;
        }

        $product = \Modules\Catalog\Models\Product::query()->find($this->productId);
        if ($product === null) {
            $indexer->deleteProductById($this->productId);

            return;
        }

        $indexer->syncProduct($product);
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('catalog_search_index_product_'.$this->productId))
                ->shared()
                ->expireAfter(120)
                ->releaseAfter(2),
        ];
    }
}
