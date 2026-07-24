<?php

namespace Modules\ImportExport\Services\Legacy;

use RuntimeException;
use Throwable;

final class LegacyCustomersOrdersSyncService
{
    public function __construct(
        private readonly LegacyCustomersImportService $customers,
        private readonly LegacyOrdersImportService $orders,
        private readonly LegacyRemoteMysqlClient $legacyMysql,
    ) {}

    /**
     * @return array{
     *     customers: array<string, int>,
     *     orders: array<string, int>
     * }
     */
    public function sync(): array
    {
        $this->assertLegacyConfigured();
        $this->assertLegacyReachable();

        $customers = $this->customers->importIncremental();
        $orders = $this->orders->importIncremental();

        return [
            'customers' => $customers,
            'orders' => $orders,
        ];
    }

    private function assertLegacyConfigured(): void
    {
        $database = trim((string) config('database.connections.legacy.database', ''));
        $username = trim((string) config('database.connections.legacy.username', ''));
        if ($database === '' || $username === '') {
            throw new RuntimeException(
                'Legacy MySQL не настроен. Заполните LEGACY_DB_DATABASE и LEGACY_DB_USERNAME в .env.'
            );
        }

        if ($this->legacyMysql->usesSsh()) {
            return;
        }

        $host = trim((string) config('database.connections.legacy.host', ''));
        if ($host === '') {
            throw new RuntimeException(
                'Задайте LEGACY_SSH_HOST + LEGACY_SSH_USER (рекомендуется) или LEGACY_DB_HOST для прямого MySQL.'
            );
        }
    }

    private function assertLegacyReachable(): void
    {
        try {
            $this->legacyMysql->ping();
        } catch (Throwable $e) {
            $via = $this->legacyMysql->usesSsh() ? 'SSH' : 'MySQL';
            throw new RuntimeException(
                "Не удалось подключиться к legacy ({$via}): ".$e->getMessage(),
                0,
                $e,
            );
        }
    }
}
