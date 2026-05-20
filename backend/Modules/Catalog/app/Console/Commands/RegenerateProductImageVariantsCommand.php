<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Modules\Catalog\Models\ProductImage;
use Modules\Catalog\Services\ProductImageVariantService;

class RegenerateProductImageVariantsCommand extends Command
{
    protected $signature = 'catalog:regenerate-product-image-variants
                            {--product-id= : Only regenerate images for this product}
                            {--limit=0 : Max images to process (0 = no limit)}
                            {--force : Regenerate even when variant paths already exist}';

    protected $description = 'Generate full/card/listing/thumb WebP variants for existing product images';

    public function handle(ProductImageVariantService $variantService): int
    {
        if (! Schema::hasColumn('product_images', 'path_full')) {
            $this->error('Колонки path_full/path_card/path_listing/path_thumb отсутствуют. Сначала выполните миграции.');

            return self::FAILURE;
        }

        $productId = $this->option('product-id');
        $limit = max(0, (int) $this->option('limit'));
        $force = (bool) $this->option('force');

        $query = ProductImage::query()->orderBy('id');
        if ($productId !== null && $productId !== '') {
            $query->where('product_id', (int) $productId);
        }
        if (! $force) {
            $query->where(function ($q): void {
                $q->whereNull('path_full')
                    ->orWhere('path_full', '');
            });
        }
        if ($limit > 0) {
            $query->limit($limit);
        }

        $images = $query->get();
        if ($images->isEmpty()) {
            $this->info('Нет изображений для обработки.');

            return self::SUCCESS;
        }

        $disk = Storage::disk('public');
        $processed = 0;
        $failed = 0;

        foreach ($images as $image) {
            $storagePath = ltrim((string) preg_replace('#^storage/#', '', (string) $image->path), '/');
            if ($storagePath === '' || ! $disk->exists($storagePath)) {
                $this->warn("SKIP image #{$image->id}: source file missing ({$image->path})");
                $failed++;

                continue;
            }

            try {
                $binary = $disk->get($storagePath);
                $directory = dirname($storagePath);
                $basename = pathinfo($storagePath, PATHINFO_FILENAME);
                $basename = preg_replace('/-(full|card|listing|thumb)$/', '', (string) $basename) ?: $basename;

                if ($force) {
                    $variantService->deleteAllVariants($image);
                }

                $variantPaths = $variantService->generateFromBinary(
                    $binary,
                    $disk,
                    $directory,
                    'product-image',
                    1,
                    $basename
                );

                $image->update([
                    'path' => $variantPaths['path'],
                    'path_full' => $variantPaths['path_full'],
                    'path_card' => $variantPaths['path_card'],
                    'path_listing' => $variantPaths['path_listing'],
                    'path_thumb' => $variantPaths['path_thumb'],
                ]);

                $processed++;
                $this->line("OK image #{$image->id}");
            } catch (\Throwable $e) {
                $failed++;
                $this->error("FAIL image #{$image->id}: {$e->getMessage()}");
            }
        }

        $this->info("Готово: {$processed} обработано, {$failed} с ошибками.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
