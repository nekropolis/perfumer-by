<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class RepairVanilleProductVariantsCommand extends Command
{
    protected $signature = 'catalog:vanille-repair-variants
        {--target=db : db — каталог в БД, json — products_*.json, both — оба}
        {--scope=missing : missing — только без вариантов, all — все связанные Vanille}
        {--offset=0 : Смещение для target=db}
        {--limit=15 : Размер пачки для target=db}
        {--json-file-offset=0 : Смещение файла для target=json}
        {--json-file-limit=1 : Сколько products_*.json обработать за итерацию}
        {--from-payload : Не качать HTML, взять offers из supplier payload (быстро, без штрих-кодов)}
        {--dry-run : Без записи}
        {--once : Одна пачка и выход}';

    protected $description = 'Добавить недостающие варианты Vanille (русские концентрации + объёмы из штрих-кодов)';

    public function handle(VanilleImportService $service): int
    {
        $target = (string) $this->option('target');
        $scope = (string) $this->option('scope');
        $dryRun = (bool) $this->option('dry-run');
        $once = (bool) $this->option('once');
        $reparse = !((bool) $this->option('from-payload'));

        if (!in_array($target, ['db', 'json', 'both'], true)) {
            $this->error('Invalid --target. Allowed: db, json, both');

            return self::FAILURE;
        }

        if (!in_array($scope, ['missing', 'all'], true)) {
            $this->error('Invalid --scope. Allowed: missing, all');

            return self::FAILURE;
        }

        $onlyMissing = $scope === 'missing';
        $offset = max(0, (int) $this->option('offset'));
        $limit = max(1, (int) $this->option('limit'));
        $jsonFileOffset = max(0, (int) $this->option('json-file-offset'));
        $jsonFileLimit = max(1, (int) $this->option('json-file-limit'));

        $exitCode = self::SUCCESS;

        if ($target === 'db' || $target === 'both') {
            $exitCode = max($exitCode, $this->runDbRepair($service, $offset, $limit, $onlyMissing, $reparse, $dryRun, $once));
        }

        if ($target === 'json' || $target === 'both') {
            $exitCode = max($exitCode, $this->runJsonRefresh($service, $jsonFileOffset, $jsonFileLimit, $dryRun, $once));
        }

        if (($target === 'json' || $target === 'both') && !$dryRun) {
            $this->newLine();
            $this->info('После json: запустите импорт спарсенных товаров (админка или catalog:vanille-queue).');
        }

        return $exitCode;
    }

    private function runDbRepair(
        VanilleImportService $service,
        int $offset,
        int $limit,
        bool $onlyMissing,
        bool $reparse,
        bool $dryRun,
        bool $once,
    ): int {
        $totalVariantsCreated = 0;
        $totalErrors = 0;
        $iteration = 0;

        do {
            $iteration++;
            $result = $service->repairVanilleVariantsBatch(
                $offset,
                $limit,
                $onlyMissing,
                $reparse,
                $dryRun,
            );

            foreach (($result['log'] ?? []) as $line) {
                $this->line((string) $line);
            }

            $totalVariantsCreated += (int) ($result['variants_created'] ?? 0);
            $totalErrors += (int) ($result['errors'] ?? 0);

            $this->info(sprintf(
                'DB batch #%d: processed=%d, variants+%d, progress=%d/%d',
                $iteration,
                (int) ($result['processed'] ?? 0),
                (int) ($result['variants_created'] ?? 0),
                (int) ($result['next_offset'] ?? 0),
                (int) ($result['total'] ?? 0)
            ));

            $offset = (int) ($result['next_offset'] ?? $offset);
            $done = (bool) ($result['done'] ?? true);
        } while (!$once && !$done);

        $this->line('DB total variants created: ' . $totalVariantsCreated);
        $this->line('DB total errors: ' . $totalErrors);

        return $totalErrors > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function runJsonRefresh(
        VanilleImportService $service,
        int $fileOffset,
        int $jsonFileLimit,
        bool $dryRun,
        bool $once,
    ): int {
        $totalUpdated = 0;
        $totalErrors = 0;
        $iteration = 0;

        do {
            $iteration++;
            $result = $service->refreshParsedJsonOffersBatch($fileOffset, $jsonFileLimit, $dryRun);

            foreach (($result['log'] ?? []) as $line) {
                $this->line((string) $line);
            }

            $totalUpdated += (int) ($result['items_updated'] ?? 0);
            $totalErrors += (int) ($result['errors'] ?? 0);

            $this->info(sprintf(
                'JSON batch #%d: items_updated=%d, files=%s, progress=%d/%d',
                $iteration,
                (int) ($result['items_updated'] ?? 0),
                implode(', ', (array) ($result['files'] ?? [])),
                (int) ($result['next_file_offset'] ?? 0),
                (int) ($result['total_files'] ?? 0)
            ));

            $fileOffset = (int) ($result['next_file_offset'] ?? $fileOffset);
            $done = (bool) ($result['done'] ?? true);
        } while (!$once && !$done);

        $this->line('JSON total items updated: ' . $totalUpdated);
        $this->line('JSON total errors: ' . $totalErrors);

        return $totalErrors > 0 ? self::FAILURE : self::SUCCESS;
    }
}
