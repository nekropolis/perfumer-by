<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function sqliteDriverAvailable(): bool
    {
        return extension_loaded('pdo_sqlite');
    }

    protected function skipUnlessSqliteDriver(): void
    {
        if (! $this->sqliteDriverAvailable()) {
            $this->markTestSkipped('pdo_sqlite extension is not available');
        }
    }
}
