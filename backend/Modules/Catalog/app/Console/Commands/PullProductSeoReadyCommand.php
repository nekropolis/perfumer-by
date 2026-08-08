<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Services\SeoDescription\ProductSeoWorkQueueService;
use Modules\Catalog\Services\SeoDescription\SeoDescriptionException;
use Throwable;

class PullProductSeoReadyCommand extends Command
{
    protected $signature = 'seo:pull-product-ready {--limit=}';

    protected $description = 'Забрать готовые SEO-описания продуктов, применить и подтвердить ack';

    public function handle(ProductSeoWorkQueueService $service): int
    {
        $limit = $this->option('limit');
        $limit = $limit === null || $limit === '' ? null : (int) $limit;

        try {
            $result = $service->pullAndApplyReady($limit);
        } catch (SeoDescriptionException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        } catch (Throwable $e) {
            $this->error('Не удалось забрать готовые SEO-описания.');

            return self::FAILURE;
        }

        $this->info(sprintf(
            'fetched=%d applied=%d failed=%d skipped=%d acked=%d',
            $result['fetched'],
            $result['applied'],
            $result['failed'],
            $result['skipped'],
            $result['acked'],
        ));

        return self::SUCCESS;
    }
}
