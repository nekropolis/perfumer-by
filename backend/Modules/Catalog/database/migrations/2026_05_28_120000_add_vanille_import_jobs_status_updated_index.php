<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vanille_import_jobs', function (Blueprint $table) {
            if (!$this->indexExists('vanille_import_jobs', 'vanille_import_jobs_status_id_index')) {
                $table->index(['status', 'id'], 'vanille_import_jobs_status_id_index');
            }

            if (!$this->indexExists('vanille_import_jobs', 'vanille_import_jobs_status_updated_at_index')) {
                $table->index(['status', 'updated_at'], 'vanille_import_jobs_status_updated_at_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('vanille_import_jobs', function (Blueprint $table) {
            if ($this->indexExists('vanille_import_jobs', 'vanille_import_jobs_status_updated_at_index')) {
                $table->dropIndex('vanille_import_jobs_status_updated_at_index');
            }
        });
    }

    private function indexExists(string $table, string $indexName): bool
    {
        $connection = Schema::getConnection();
        $driver = $connection->getDriverName();

        if ($driver === 'sqlite') {
            $rows = $connection->select("PRAGMA index_list('{$table}')");
            foreach ($rows as $row) {
                if (($row->name ?? '') === $indexName) {
                    return true;
                }
            }

            return false;
        }

        $database = $connection->getDatabaseName();
        $result = $connection->selectOne(
            'SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1',
            [$database, $table, $indexName],
        );

        return $result !== null;
    }
};
