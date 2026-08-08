<?php

namespace Modules\Catalog\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Modules\Catalog\Models\ProductSeoGeneration;
use Modules\Catalog\Services\SeoDescription\ProductSeoGenerationService;
use Modules\Catalog\Services\SeoDescription\SeoDescriptionClient;
use Throwable;

class DispatchProductSeoGeneration implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public int $timeout = 30;

    public bool $failOnTimeout = true;

    public function __construct(public int $generationId)
    {
        $this->onQueue((string) config('seo_description.queue', 'default'));
    }

    public function handle(
        SeoDescriptionClient $client,
        ProductSeoGenerationService $service,
    ): void {
        $generation = ProductSeoGeneration::query()->find($this->generationId);
        if ($generation === null || $generation->isTerminal() || $generation->external_job_id !== null) {
            return;
        }

        try {
            $response = $client->dispatch((array) $generation->source_snapshot);
        } catch (Throwable $e) {
            $service->fail($this->generationId, $e->getMessage());

            return;
        }

        $generation->update([
            'external_job_id' => $response['job_id'],
            'external_status' => $response['status'],
            'status' => ProductSeoGeneration::STATUS_SUBMITTED,
            'attempts' => $generation->attempts + 1,
        ]);

        PollProductSeoGeneration::dispatch($this->generationId)
            ->delay(now()->addSeconds(max(1, (int) config('seo_description.poll_interval', 5))));
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('product_seo_dispatch_'.$this->generationId))
                ->dontRelease()
                ->expireAfter(60),
        ];
    }

    public function failed(?Throwable $exception): void
    {
        app(ProductSeoGenerationService::class)->fail(
            $this->generationId,
            $exception?->getMessage() ?: 'Не удалось отправить задание в SEO API.',
        );
    }
}
