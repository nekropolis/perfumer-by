<?php

namespace Modules\Checkout\Console\Commands;

use Illuminate\Console\Command;
use Modules\Checkout\Services\Dashboard\DashboardSalesAggregateService;

class RebuildDashboardSalesStatsCommand extends Command
{
    protected $signature = 'dashboard:rebuild-sales-stats';

    protected $description = 'Пересобрать дневные агрегаты продаж дашборда из выполненных заказов';

    public function handle(DashboardSalesAggregateService $aggregate): int
    {
        $count = $aggregate->rebuild();
        $this->info("Готово. Учтено выполненных заказов: {$count}.");

        return self::SUCCESS;
    }
}
