<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\Catalog\Services\SmartSearch\ProductSearchIndexer;

class ReindexProductSearchCommand extends Command
{
    protected $signature = 'catalog:search:reindex {--chunk=200 : Chunk size for product indexing}';

    protected $description = 'Полная переиндексация каталога в Meilisearch';

    public function handle(ProductSearchIndexer $indexer): int
    {
        if (!$indexer->isEnabled()) {
            $this->warn('Meilisearch не настроен. Заполните CATALOG_SEARCH_MEILI_URL и включите CATALOG_SEARCH_ENABLED.');

            return self::INVALID;
        }

        $chunk = (int) $this->option('chunk');
        $chunk = max(20, min($chunk, 1000));

        $this->info('Запускаю индексацию каталога в Meilisearch...');
        $indexer->rebuildAll($chunk);
        $this->info('Индексация завершена.');

        return self::SUCCESS;
    }
}
