<?php

namespace Modules\Catalog\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Modules\Catalog\Services\SimilarProductsService;

class RebuildProductSimilarsJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $timeout = 60;

    public function __construct(
        public int $productId,
    ) {
    }

    public function handle(SimilarProductsService $similarProductsService): void
    {
        if ($this->productId <= 0) {
            return;
        }

        $similarProductsService->rebuildForProduct($this->productId);
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('catalog_rebuild_similars_'.$this->productId))
                ->expireAfter(120)
                ->releaseAfter(5),
        ];
    }
}
