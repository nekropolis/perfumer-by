<?php

namespace Tests\Unit;

use Modules\Catalog\Support\PublicStorageWriteGuard;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class PublicStorageWriteGuardTest extends TestCase
{
    public function test_detects_laravel_directory_creation_error(): void
    {
        $error = new RuntimeException(
            'Unable to create a directory at /var/www/perfumer-by/backend/storage/app/public/products/604/catalog.'
        );

        $this->assertTrue(PublicStorageWriteGuard::isStorageWriteError($error));
    }

    public function test_detects_permission_denied_in_previous_exception(): void
    {
        $previous = new RuntimeException('Permission denied');
        $error = new RuntimeException('Filesystem write failed', 0, $previous);

        $this->assertTrue(PublicStorageWriteGuard::isStorageWriteError($error));
    }

    public function test_ignores_unrelated_errors(): void
    {
        $error = new RuntimeException('HTTP 404 for https://example.com/image.jpg');

        $this->assertFalse(PublicStorageWriteGuard::isStorageWriteError($error));
    }
}
