<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class ParseVanilleProductsCommand extends Command
{
    protected $signature = 'catalog:parse-vanille-products
        {--offset=0 : Start offset in product_links.json}
        {--limit=20 : Batch size per iteration}
        {--max-links= : Optional cap for total links}
        {--mode=full : full|new_only}
        {--links-path= : Optional custom links file path}
        {--once : Run only one batch and exit}';

    protected $description = 'Parse only Vanille product pages from existing links file';

    public function handle(VanilleImportService $service): int
    {
        $offset = max(0, (int) $this->option('offset'));
        $limit = max(1, (int) $this->option('limit'));
        $maxLinksOpt = $this->option('max-links');
        $maxLinks = $maxLinksOpt !== null ? max(1, (int) $maxLinksOpt) : null;
        $mode = (string) ($this->option('mode') ?: VanilleImportService::PARSE_PRODUCTS_MODE_FULL);
        $linksPath = $this->option('links-path');
        $linksPath = is_string($linksPath) && trim($linksPath) !== '' ? trim($linksPath) : null;
        $once = (bool) $this->option('once');

        if (!in_array($mode, [
            VanilleImportService::PARSE_PRODUCTS_MODE_FULL,
            VanilleImportService::PARSE_PRODUCTS_MODE_NEW_ONLY,
        ], true)) {
            $this->error("Invalid --mode={$mode}. Allowed: full, new_only");
            return self::FAILURE;
        }

        $totalCount = 0;
        $totalErrors = 0;
        $iteration = 0;

        do {
            $iteration++;
            $result = $service->parseProducts($offset, $limit, $maxLinks, $mode, $linksPath);

            foreach (($result['log'] ?? []) as $line) {
                $this->line((string) $line);
            }

            $batchCount = (int) ($result['count'] ?? 0);
            $batchErrors = (int) ($result['errors'] ?? 0);
            $totalCount += $batchCount;
            $totalErrors += $batchErrors;

            $nextOffset = (int) ($result['next_offset'] ?? ($offset + $limit));
            $done = (bool) ($result['done'] ?? true);
            $totalLinks = (int) ($result['total_links'] ?? 0);

            $this->info(sprintf(
                'Batch #%d done: parsed=%d, errors=%d, progress=%d/%d',
                $iteration,
                $batchCount,
                $batchErrors,
                min($nextOffset, max($totalLinks, 0)),
                $totalLinks
            ));

            if (!($result['success'] ?? false) && $batchCount === 0 && $batchErrors > 0) {
                $this->error((string) ($result['message'] ?? 'Batch failed'));
                return self::FAILURE;
            }

            $offset = $nextOffset;

            if ($once) {
                break;
            }
        } while (!$done);

        $this->newLine();
        $this->info((string) ($result['message'] ?? 'Parse products completed'));
        $this->line('Total parsed: ' . $totalCount);
        $this->line('Total errors: ' . $totalErrors);
        $this->line('Last file: ' . (string) ($result['last_file'] ?? '-'));
        $this->line('Links path: ' . (string) ($result['links_path'] ?? '-'));

        return $totalErrors > 0 ? self::FAILURE : self::SUCCESS;
    }
}

