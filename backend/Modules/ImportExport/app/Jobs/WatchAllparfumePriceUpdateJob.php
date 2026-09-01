<?php

namespace Modules\ImportExport\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\ImportExport\Services\Allparfume\AllparfumePriceUpdateWatchService;

class WatchAllparfumePriceUpdateJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public int $timeout = 60;

    public function __construct(
        public int $attempt = 1,
    ) {
    }

    public function handle(AllparfumePriceUpdateWatchService $watch): void
    {
        $watch->run($this->attempt);
    }
}
