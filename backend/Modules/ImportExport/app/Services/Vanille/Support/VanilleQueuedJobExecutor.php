<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use Modules\Catalog\Models\VanilleImportJob;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class VanilleQueuedJobExecutor
{
    private const COLLECT_LINKS_BATCH_SIZE = 3;

    private const PARSE_PRODUCTS_BATCH_SIZE = 2;

    public function execute(VanilleImportJob $job, VanilleImportService $service): array
    {
        return match ($job->type) {
            VanilleImportService::JOB_TYPE_PARSE_BRANDS => $this->runParseBrands($job, $service),
            VanilleImportService::JOB_TYPE_COLLECT_LINKS => $this->runCollectLinks($job, $service),
            VanilleImportService::JOB_TYPE_PARSE_PRODUCTS => $this->runParseProducts($job, $service),
            VanilleImportService::JOB_TYPE_IMPORT_PARSED_PRODUCTS => $this->runImportParsedProducts($job, $service),
            VanilleImportService::JOB_TYPE_PIPELINE_NEW_PRODUCTS => $this->runPipeline($job, $service, true),
            VanilleImportService::JOB_TYPE_PIPELINE_REFRESH_ALL => $this->runPipeline($job, $service, false),
            default => throw new \RuntimeException('Неизвестный тип задачи: ' . $job->type),
        };
    }

    public function label(string $type): string
    {
        return match ($type) {
            VanilleImportService::JOB_TYPE_PARSE_BRANDS => 'Парсинг брендов',
            VanilleImportService::JOB_TYPE_COLLECT_LINKS => 'Сбор ссылок товаров',
            VanilleImportService::JOB_TYPE_PARSE_PRODUCTS => 'Массовый парсинг карточек',
            VanilleImportService::JOB_TYPE_IMPORT_PARSED_PRODUCTS => 'Импорт спарсенных товаров',
            VanilleImportService::JOB_TYPE_PIPELINE_NEW_PRODUCTS => 'Парсинг нового товара',
            VanilleImportService::JOB_TYPE_PIPELINE_REFRESH_ALL => 'Обновление всех карточек',
            default => 'Парсинг',
        };
    }

    private function runParseBrands(VanilleImportJob $job, VanilleImportService $service): array
    {
        $result = $service->parseBrands();

        return [
            'done' => true,
            'progress' => 100,
            'message' => $this->label($job->type) . ': бренды спарсены',
            'result' => $result,
        ];
    }

    private function runCollectLinks(VanilleImportJob $job, VanilleImportService $service): array
    {
        $state = is_array($job->result['state'] ?? null) ? $job->result['state'] : [];
        $offset = (int) ($state['offset'] ?? 0);
        $maxLinks = null;
        $batch = $service->collectProductLinks($offset, self::COLLECT_LINKS_BATCH_SIZE, $maxLinks);
        $done = (bool) ($batch['done'] ?? true);
        $nextOffset = (int) ($batch['next_offset'] ?? ($offset + self::COLLECT_LINKS_BATCH_SIZE));
        $processedBrands = min($nextOffset, (int) ($batch['total_brands'] ?? $nextOffset));
        $totalBrands = max((int) ($batch['total_brands'] ?? 0), 1);
        $progress = max(5, min(95, (int) round(($processedBrands / $totalBrands) * 100)));

        return [
            'done' => $done,
            'progress' => $done ? 100 : $progress,
            'message' => sprintf('Сбор ссылок: %d / %d брендов', $processedBrands, $totalBrands),
            'result' => $done
                ? $batch
                : [
                    'state' => [
                        'offset' => $nextOffset,
                        'limit' => self::COLLECT_LINKS_BATCH_SIZE,
                    ],
                    'processed_brands' => $processedBrands,
                    'total_brands' => $totalBrands,
                    'count' => (int) ($batch['count'] ?? 0),
                    'path' => $batch['path'] ?? null,
                ],
        ];
    }

    private function runParseProducts(VanilleImportJob $job, VanilleImportService $service): array
    {
        $state = is_array($job->result['state'] ?? null) ? $job->result['state'] : [];
        $offset = (int) ($state['offset'] ?? 0);
        $mode = (string) ($state['mode'] ?? VanilleImportService::PARSE_PRODUCTS_MODE_FULL);
        $linksPath = isset($state['links_path']) ? (string) $state['links_path'] : null;
        $linksPath = $linksPath !== '' ? $linksPath : null;

        $maxLinks = null;
        $batch = $service->parseProducts(
            $offset,
            self::PARSE_PRODUCTS_BATCH_SIZE,
            $maxLinks,
            $mode,
            $linksPath
        );
        $done = (bool) ($batch['done'] ?? true);
        $nextOffset = (int) ($batch['next_offset'] ?? ($offset + self::PARSE_PRODUCTS_BATCH_SIZE));
        $totalCount = (int) ($state['total_count'] ?? 0) + (int) ($batch['count'] ?? 0);
        $totalErrors = (int) ($state['total_errors'] ?? 0) + (int) ($batch['errors'] ?? 0);
        $processed = (int) ($batch['next_offset'] ?? $nextOffset);
        $total = max((int) ($batch['total_links'] ?? 0), 1);
        $progress = max(5, min(95, (int) round(($processed / $total) * 100)));

        $nextLinksPath = $batch['links_path'] ?? $linksPath;

        return [
            'done' => $done,
            'progress' => $done ? 100 : $progress,
            'message' => sprintf('Парсинг карточек: %d / %d', min($processed, $total), $total),
            'result' => $done
                ? [
                    ...$batch,
                    'count' => $totalCount,
                    'errors' => $totalErrors,
                ]
                : [
                    'state' => [
                        'offset' => $nextOffset,
                        'limit' => self::PARSE_PRODUCTS_BATCH_SIZE,
                        'mode' => $mode,
                        'links_path' => $nextLinksPath,
                        'total_count' => $totalCount,
                        'total_errors' => $totalErrors,
                    ],
                    'processed_links' => min($processed, $total),
                    'total_links' => $total,
                    'count' => $totalCount,
                    'errors' => $totalErrors,
                    'last_file' => $batch['last_file'] ?? null,
                ],
        ];
    }

    private function runPipeline(VanilleImportJob $job, VanilleImportService $service, bool $newProductsOnly): array
    {
        $result = is_array($job->result) ? $job->result : [];
        $phase = (string) ($result['phase'] ?? 'parse_brands');

        if ($phase === 'parse_brands') {
            $brandsResult = $service->parseBrands();
            if (!($brandsResult['success'] ?? false)) {
                throw new \RuntimeException((string) ($brandsResult['message'] ?? 'Парсинг брендов не удался'));
            }

            return [
                'done' => false,
                'progress' => 8,
                'message' => $this->label($job->type) . ': бренды готовы → сбор ссылок',
                'result' => [
                    'pipeline' => $job->type,
                    'phase' => 'collect_links',
                    'brands' => $brandsResult,
                    'collect_state' => [
                        'offset' => 0,
                        'limit' => self::COLLECT_LINKS_BATCH_SIZE,
                    ],
                ],
            ];
        }

        if ($phase === 'collect_links') {
            $collectState = is_array($result['collect_state'] ?? null) ? $result['collect_state'] : [];
            $offset = (int) ($collectState['offset'] ?? 0);
            $batch = $service->collectProductLinks($offset, self::COLLECT_LINKS_BATCH_SIZE, null);
            $doneCollect = (bool) ($batch['done'] ?? true);
            $nextOffset = (int) ($batch['next_offset'] ?? ($offset + self::COLLECT_LINKS_BATCH_SIZE));
            $processedBrands = min($nextOffset, (int) ($batch['total_brands'] ?? $nextOffset));
            $totalBrands = max((int) ($batch['total_brands'] ?? 0), 1);
            $collectProgress = max(5, min(40, (int) round(($processedBrands / $totalBrands) * 40)));

            if (!$doneCollect) {
                return [
                    'done' => false,
                    'progress' => 8 + $collectProgress,
                    'message' => sprintf(
                        '%s: сбор ссылок %d / %d брендов',
                        $this->label($job->type),
                        $processedBrands,
                        $totalBrands
                    ),
                    'result' => [
                        ...$result,
                        'phase' => 'collect_links',
                        'collect_state' => [
                            'offset' => $nextOffset,
                            'limit' => self::COLLECT_LINKS_BATCH_SIZE,
                        ],
                        'last_collect_batch' => $batch,
                    ],
                ];
            }

            $parseMode = $newProductsOnly
                ? VanilleImportService::PARSE_PRODUCTS_MODE_NEW_ONLY
                : VanilleImportService::PARSE_PRODUCTS_MODE_FULL;

            return [
                'done' => false,
                'progress' => 50,
                'message' => $this->label($job->type) . ': ссылки собраны → парсинг карточек',
                'result' => [
                    ...$result,
                    'phase' => 'parse_products',
                    'collect_finished' => $batch,
                    'parse_state' => [
                        'offset' => 0,
                        'limit' => self::PARSE_PRODUCTS_BATCH_SIZE,
                        'mode' => $parseMode,
                        'links_path' => null,
                        'total_count' => 0,
                        'total_errors' => 0,
                    ],
                ],
            ];
        }

        if ($phase === 'parse_products') {
            $parseState = is_array($result['parse_state'] ?? null) ? $result['parse_state'] : [];
            $offset = (int) ($parseState['offset'] ?? 0);
            $mode = (string) ($parseState['mode'] ?? VanilleImportService::PARSE_PRODUCTS_MODE_FULL);
            $linksPath = isset($parseState['links_path']) ? (string) $parseState['links_path'] : null;
            $linksPath = $linksPath !== '' ? $linksPath : null;

            $batch = $service->parseProducts(
                $offset,
                self::PARSE_PRODUCTS_BATCH_SIZE,
                null,
                $mode,
                $linksPath
            );
            $doneParse = (bool) ($batch['done'] ?? true);
            $nextOffset = (int) ($batch['next_offset'] ?? ($offset + self::PARSE_PRODUCTS_BATCH_SIZE));
            $totalCount = (int) ($parseState['total_count'] ?? 0) + (int) ($batch['count'] ?? 0);
            $totalErrors = (int) ($parseState['total_errors'] ?? 0) + (int) ($batch['errors'] ?? 0);
            $processed = (int) ($batch['next_offset'] ?? $nextOffset);
            $total = max((int) ($batch['total_links'] ?? 0), 1);
            $parseProgress = max(5, min(45, (int) round(($processed / $total) * 45)));
            $nextLinksPath = $batch['links_path'] ?? $linksPath;

            if (!$doneParse) {
                return [
                    'done' => false,
                    'progress' => 50 + $parseProgress,
                    'message' => sprintf(
                        '%s: карточки %d / %d',
                        $this->label($job->type),
                        min($processed, $total),
                        $total
                    ),
                    'result' => [
                        ...$result,
                        'phase' => 'parse_products',
                        'parse_state' => [
                            'offset' => $nextOffset,
                            'limit' => self::PARSE_PRODUCTS_BATCH_SIZE,
                            'mode' => $mode,
                            'links_path' => $nextLinksPath,
                            'total_count' => $totalCount,
                            'total_errors' => $totalErrors,
                        ],
                        'last_parse_batch' => $batch,
                    ],
                ];
            }

            return [
                'done' => true,
                'progress' => 100,
                'message' => $this->label($job->type) . ': завершено',
                'result' => [
                    ...$result,
                    'phase' => 'completed',
                    'parse_finished' => [
                        ...$batch,
                        'count' => $totalCount,
                        'errors' => $totalErrors,
                    ],
                ],
            ];
        }

        throw new \RuntimeException('Некорректное состояние пайплайна: ' . $phase);
    }

    private function runImportParsedProducts(VanilleImportJob $job, VanilleImportService $service): array
    {
        $state = is_array($job->result['state'] ?? null) ? $job->result['state'] : [];
        $offset = (int) ($state['offset'] ?? 0);
        $totalImported = (int) ($state['total_imported'] ?? 0);
        $totalUpdated = (int) ($state['total_updated'] ?? 0);
        $totalErrors = (int) ($state['total_errors'] ?? 0);
        $totalItems = (int) ($state['total_items'] ?? 0);
        $batchLimit = 1;

        $batch = $service->importParsedProductsBatch($offset, $batchLimit);
        $done = (bool) ($batch['done'] ?? true);
        $nextOffset = (int) ($batch['next_offset'] ?? ($offset + $batchLimit));
        $totalFiles = max((int) ($batch['total_files'] ?? 0), 1);
        $processedFiles = min($nextOffset, $totalFiles);
        $progress = $done ? 100 : max(5, min(95, (int) round(($processedFiles / $totalFiles) * 100)));

        $totalImported += (int) ($batch['imported'] ?? 0);
        $totalUpdated += (int) ($batch['updated'] ?? 0);
        $totalErrors += (int) ($batch['errors'] ?? 0);
        $totalItems += (int) ($batch['items'] ?? 0);

        if ($done) {
            return [
                'done' => true,
                'progress' => 100,
                'message' => $totalErrors === 0
                    ? 'Импорт спарсенных товаров завершён'
                    : 'Импорт спарсенных товаров завершён с ошибками',
                'result' => [
                    ...$batch,
                    'imported' => $totalImported,
                    'updated' => $totalUpdated,
                    'errors' => $totalErrors,
                    'items' => $totalItems,
                ],
            ];
        }

        return [
            'done' => false,
            'progress' => $progress,
            'message' => sprintf('Импорт спарсенных товаров: %d / %d файлов', $processedFiles, $totalFiles),
            'result' => [
                'state' => [
                    'offset' => $nextOffset,
                    'total_imported' => $totalImported,
                    'total_updated' => $totalUpdated,
                    'total_errors' => $totalErrors,
                    'total_items' => $totalItems,
                ],
                'total_files' => $totalFiles,
                'processed_files' => $processedFiles,
                'imported' => $totalImported,
                'updated' => $totalUpdated,
                'errors' => $totalErrors,
                'items' => $totalItems,
            ],
        ];
    }
}
