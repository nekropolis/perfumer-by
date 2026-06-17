<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class RepairVanilleProductNamesCommand extends Command
{
    protected $signature = 'catalog:vanille-repair-product-names
        {--offset=0 : Смещение по supplier_products}
        {--limit=50 : Размер пачки}
        {--scope=slug-derived : slug-derived — name в нижнем регистре как slug URL; all — все связанные Vanille}
        {--from-payload : Не качать HTML, взять name/Аромат из supplier payload}
        {--reparse : Всегда перепарсить карточку Vanille перед обновлением}
        {--reparse-if-stuck : Reparse только если payload не даёт лучшее имя}
        {--dry-run : Без записи}
        {--once : Одна пачка и выход}
        {--log-skips : Логировать SKIP по каждому товару}';

    protected $description = 'Восстановить регистр products.name/h1 у товаров Vanille (slug URL → h1/Аромат)';

    public function handle(VanilleImportService $service): int
    {
        $scope = (string) $this->option('scope');
        if (! in_array($scope, ['slug-derived', 'all'], true)) {
            $this->error('Invalid --scope. Allowed: slug-derived, all');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $once = (bool) $this->option('once');
        $verbose = (bool) $this->option('log-skips');
        $offset = max(0, (int) $this->option('offset'));
        $limit = max(1, (int) $this->option('limit'));
        $reparse = (bool) $this->option('reparse');
        $reparseIfStuck = (bool) $this->option('reparse-if-stuck');
        $fromPayload = (bool) $this->option('from-payload');

        if ($reparse && $fromPayload) {
            $this->error('Use either --reparse or --from-payload, not both.');

            return self::FAILURE;
        }

        if (! $reparse && ! $fromPayload && ! $reparseIfStuck) {
            $reparseIfStuck = true;
        }

        $totalUpdated = 0;
        $totalWouldUpdate = 0;
        $totalSkipped = 0;
        $totalSkippedNotEligible = 0;
        $totalSkippedAlreadyCorrect = 0;
        $totalSkippedStuck = 0;
        $totalReparsed = 0;
        $totalErrors = 0;
        $totalLinked = 0;
        $iteration = 0;

        do {
            $iteration++;
            $result = $service->repairVanilleProductNamesBatch(
                $offset,
                $limit,
                $scope === 'slug-derived',
                $reparse,
                $reparseIfStuck,
                $dryRun,
                $verbose,
            );

            foreach (($result['log'] ?? []) as $line) {
                $this->line((string) $line);
            }

            $totalUpdated += (int) ($result['updated'] ?? 0);
            $totalWouldUpdate += (int) ($result['would_update'] ?? 0);
            $totalSkipped += (int) ($result['skipped'] ?? 0);
            $totalSkippedNotEligible += (int) ($result['skipped_not_eligible'] ?? 0);
            $totalSkippedAlreadyCorrect += (int) ($result['skipped_already_correct'] ?? 0);
            $totalSkippedStuck += (int) ($result['skipped_stuck'] ?? 0);
            $totalReparsed += (int) ($result['reparsed'] ?? 0);
            $totalErrors += (int) ($result['errors'] ?? 0);
            $totalLinked = (int) ($result['total'] ?? $totalLinked);

            $changeCount = $dryRun
                ? (int) ($result['would_update'] ?? 0)
                : (int) ($result['updated'] ?? 0);

            $this->info(sprintf(
                'Batch #%d: processed=%d, %s=%d, skipped=%d, progress=%d/%d',
                $iteration,
                (int) ($result['processed'] ?? 0),
                $dryRun ? 'would_update' : 'updated',
                $changeCount,
                (int) ($result['skipped'] ?? 0),
                (int) ($result['next_offset'] ?? 0),
                (int) ($result['total'] ?? 0),
            ));

            $offset = (int) ($result['next_offset'] ?? $offset);
            $done = (bool) ($result['done'] ?? true);
        } while (! $once && ! $done);

        $this->newLine();
        $this->info('Итого по связанным Vanille-товарам: ' . $totalLinked);

        if ($dryRun) {
            $this->line('Будет обновлено: ' . $totalWouldUpdate);
        } else {
            $this->line('Обновлено: ' . $totalUpdated);
        }

        $this->line('Пропущено (не lowercase slug): ' . $totalSkippedNotEligible);
        $this->line('Пропущено (уже верный регистр): ' . $totalSkippedAlreadyCorrect);
        $this->line('Пропущено (нет лучшего имени в payload): ' . $totalSkippedStuck);
        $this->line('Всего пропущено: ' . $totalSkipped);
        $this->line('Перепарсено URL: ' . $totalReparsed);
        $this->line('Ошибок: ' . $totalErrors);

        return $totalErrors > 0 ? self::FAILURE : self::SUCCESS;
    }
}
