<?php

namespace Modules\Catalog\Support;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

final class PublicStorageWriteGuard
{
    public static function assertProductImagesWritable(): void
    {
        $disk = Storage::disk('public');
        $root = rtrim($disk->path(''), DIRECTORY_SEPARATOR);
        $probeDir = 'products/.__storage_write_probe/catalog';

        try {
            self::probeDirectoryWrite($disk, $probeDir);
            $disk->deleteDirectory('products/.__storage_write_probe');
        } catch (Throwable $e) {
            $disk->deleteDirectory('products/.__storage_write_probe');

            throw new RuntimeException(
                'Нет прав на запись в каталог изображений товаров ('.$root.'/products/). '
                .'Импорт изображений остановлен: воркер не сможет создавать файлы. '
                .'Исправьте владельца и права каталога storage (обычно www-data). '
                .'Детали: '.$e->getMessage(),
                0,
                $e
            );
        }
    }

    public static function isStorageWriteError(Throwable $e): bool
    {
        $message = strtolower($e->getMessage());

        foreach ([
            'unable to create a directory',
            'failed to open stream',
            'permission denied',
            'read-only file system',
            'no space left on device',
            'не удалось записать',
            'нет прав на запись',
        ] as $needle) {
            if (str_contains($message, $needle)) {
                return true;
            }
        }

        $previous = $e->getPrevious();
        if ($previous instanceof Throwable && $previous !== $e) {
            return self::isStorageWriteError($previous);
        }

        return false;
    }

    private static function probeDirectoryWrite(Filesystem $disk, string $directory): void
    {
        $disk->makeDirectory($directory);

        $probeFile = $directory.'/.__probe.txt';
        if (! $disk->put($probeFile, 'ok')) {
            throw new RuntimeException('Не удалось записать тестовый файл в '.$directory);
        }

        $disk->delete($probeFile);
    }
}
