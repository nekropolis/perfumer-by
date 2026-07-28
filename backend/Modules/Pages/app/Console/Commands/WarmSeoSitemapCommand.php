<?php

namespace Modules\Pages\Console\Commands;

use Illuminate\Console\Command;
use Modules\Pages\Services\SeoSitemapService;

class WarmSeoSitemapCommand extends Command
{
    protected $signature = 'seo:warm-sitemap';

    protected $description = 'Сбросить и прогреть Redis-кеш URL для sitemap';

    public function handle(SeoSitemapService $sitemap): int
    {
        $this->info('Прогрев seo sitemap cache...');

        $startedAt = microtime(true);
        $rows = $sitemap->warm();
        $elapsedMs = round((microtime(true) - $startedAt) * 1000, 1);

        $this->line(sprintf('  warmed %d urls (%s ms)', count($rows), $elapsedMs));
        $this->info('Готово.');

        return self::SUCCESS;
    }
}
