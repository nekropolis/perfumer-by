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
use Modules\Catalog\Services\SeoDescription\SeoDescriptionException;
use Throwable;

class PollProductSeoGeneration implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 0;

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
        if ($generation === null || $generation->isTerminal()) {
            return;
        }

        if ($generation->deadline_at->isPast()) {
            $service->fail($this->generationId, 'Превышено время ожидания SEO API.');

            return;
        }

        if (! is_string($generation->external_job_id) || $generation->external_job_id === '') {
            $service->fail($this->generationId, 'SEO API job ID отсутствует.');

            return;
        }

        try {
            $response = $client->status($generation->external_job_id);
        } catch (SeoDescriptionException $e) {
            if (! $e->retryable) {
                $service->fail($this->generationId, $e->getMessage());

                return;
            }
            $generation->update([
                'status' => ProductSeoGeneration::STATUS_POLLING,
                'attempts' => $generation->attempts + 1,
                'error' => mb_substr($e->getMessage(), 0, 2000),
            ]);
            $this->release(max(1, (int) config('seo_description.poll_interval', 5)));

            return;
        } catch (Throwable $e) {
            $service->fail($this->generationId, $e->getMessage());

            return;
        }

        $generation->update([
            'status' => ProductSeoGeneration::STATUS_POLLING,
            'external_status' => $response['status'],
            'result' => $response['status'] === 'completed'
                ? ($response['result'] ?? [])
                : $generation->result,
            'attempts' => $generation->attempts + 1,
            'error' => null,
        ]);

        if ($response['status'] === 'failed') {
            $service->fail(
                $this->generationId,
                $response['error'] ?: 'SEO API не смог сгенерировать данные.',
                'failed',
            );

            return;
        }

        if ($response['status'] === 'completed') {
            try {
                $service->applyCompleted($this->generationId, $response['result'] ?? []);
            } catch (Throwable $e) {
                $service->fail($this->generationId, $e->getMessage(), 'completed');
            }

            return;
        }

        $this->release(max(1, (int) config('seo_description.poll_interval', 5)));
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping('product_seo_generation_'.$this->generationId))
                ->expireAfter(60)
                ->releaseAfter(2),
        ];
    }

    public function failed(?Throwable $exception): void
    {
        app(ProductSeoGenerationService::class)->fail(
            $this->generationId,
            $exception?->getMessage() ?: 'Не удалось получить результат SEO API.',
        );
    }
}
