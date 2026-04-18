<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class ImportVanilleSampleCommand extends Command
{
    protected $signature = 'catalog:import-vanille-sample {path}';
    protected $description = 'Import sample parsed products from vanille.by JSON file';

    public function handle(VanilleImportService $service): int
    {
        $result = $service->importFromJsonFile($this->argument('path'));

        foreach ($result['log'] ?? [] as $line) {
            $this->line($line);
        }

        $this->info(($result['message'] ?? 'Done'));
        $this->line('Imported: ' . ($result['imported'] ?? 0));
        $this->line('Updated: ' . ($result['updated'] ?? 0));
        $this->line('Errors: ' . ($result['errors'] ?? 0));

        return ($result['success'] ?? false) ? self::SUCCESS : self::FAILURE;
    }
}
