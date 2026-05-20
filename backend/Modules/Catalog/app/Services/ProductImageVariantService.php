<?php

namespace Modules\Catalog\Services;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;
use Modules\Catalog\Models\ProductImage;

class ProductImageVariantService
{
    /** @var array<string, array{max: int, quality: int, suffix: string}> */
    private const VARIANTS = [
        'full' => ['max' => 1800, 'quality' => 86, 'suffix' => '-full'],
        'card' => ['max' => 900, 'quality' => 82, 'suffix' => '-card'],
        'listing' => ['max' => 640, 'quality' => 80, 'suffix' => '-listing'],
        'thumb' => ['max' => 240, 'quality' => 78, 'suffix' => '-thumb'],
    ];

    /**
     * @return array{
     *     path: string,
     *     path_full: string,
     *     path_card: string,
     *     path_listing: string,
     *     path_thumb: string
     * }
     */
    public function generateFromUploadedFile(
        UploadedFile $file,
        FilesystemAdapter $disk,
        string $directory,
        string $baseSlug,
        int $number
    ): array {
        $path = $file->getRealPath();
        if ($path === false) {
            throw new \RuntimeException('Не удалось прочитать загруженный файл изображения.');
        }

        $binary = file_get_contents($path);
        if ($binary === false || $binary === '') {
            throw new \RuntimeException('Пустой файл изображения.');
        }

        return $this->generateFromBinary($binary, $disk, $directory, $baseSlug, $number);
    }

    /**
     * @return array{
     *     path: string,
     *     path_full: string,
     *     path_card: string,
     *     path_listing: string,
     *     path_thumb: string
     * }
     */
    public function generateFromBinary(
        string $binary,
        FilesystemAdapter $disk,
        string $directory,
        string $baseSlug,
        int $number,
        ?string $baseFilename = null
    ): array {
        $disk->makeDirectory($directory);
        $manager = new ImageManager(new Driver());
        $baseName = $baseFilename ?? sprintf('%s-%d', $baseSlug, max(1, $number));

        $paths = [];
        foreach (self::VARIANTS as $key => $config) {
            $image = $manager->read($binary);
            $image->scaleDown(width: $config['max'], height: $config['max']);
            $encoded = $image->toWebp(quality: $config['quality']);

            $filename = $baseName.$config['suffix'].'.webp';
            $storedPath = $directory.'/'.$filename;
            $disk->put($storedPath, (string) $encoded);

            $paths['path_'.$key] = 'storage/'.ltrim($storedPath, '/');
        }

        $paths['path'] = $paths['path_full'];

        return $paths;
    }

    public function deleteAllVariants(ProductImage $image): void
    {
        $candidates = array_unique(array_filter([
            $image->path,
            $image->path_full,
            $image->path_card,
            $image->path_listing,
            $image->path_thumb,
        ]));

        $disk = Storage::disk('public');
        foreach ($candidates as $dbPath) {
            $storagePath = ltrim((string) preg_replace('#^storage/#', '', (string) $dbPath), '/');
            if ($storagePath === '' || ! $disk->exists($storagePath)) {
                continue;
            }

            $disk->delete($storagePath);
        }
    }
}
