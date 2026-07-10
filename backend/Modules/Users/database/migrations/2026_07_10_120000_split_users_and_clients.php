<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('clients')) {
            Schema::create('clients', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('first_name')->nullable();
                $table->string('last_name')->nullable();
                $table->string('patronymic')->nullable();
                $table->date('birth_date')->nullable();
                $table->string('email')->unique();
                $table->string('password');
                $table->string('phone')->nullable()->unique();
                $table->timestamp('phone_verified_at')->nullable();
                $table->rememberToken();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'role')) {
            return;
        }

        $customerIds = DB::table('users')->where('role', 'customer')->pluck('id')->all();

        if ($customerIds !== [] && DB::table('clients')->whereIn('id', $customerIds)->count() < count($customerIds)) {
            DB::statement('
                INSERT INTO clients (
                    id, name, first_name, last_name, patronymic, birth_date,
                    email, password, phone, phone_verified_at, remember_token,
                    created_at, updated_at
                )
                SELECT
                    id, name, first_name, last_name, patronymic, birth_date,
                    email, password, phone, phone_verified_at, remember_token,
                    created_at, updated_at
                FROM users
                WHERE role = ?
                ON DUPLICATE KEY UPDATE id = id
            ', ['customer']);
        }

        $this->migrateUserIdToClientId('orders');
        $this->migrateUserIdToClientId('carts');
        $this->migrateUserIdToClientId('stock_notification_requests');
        $this->migrateUserIdToClientId('legacy_map_customers');

        $this->migrateWishlistItems();
        $this->migrateDiscountCardsPivot();
        $this->migrateGiftCertificates();

        if (Schema::hasTable('personal_access_tokens') && $customerIds !== []) {
            DB::table('personal_access_tokens')
                ->where('tokenable_type', 'Modules\\Users\\Models\\User')
                ->whereIn('tokenable_id', $customerIds)
                ->update(['tokenable_type' => 'Modules\\Users\\Models\\Client']);
        }

        DB::table('users')->where('role', 'customer')->delete();
    }

    public function down(): void
    {
        // Irreversible data split migration.
    }

    private function migrateUserIdToClientId(string $table): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'user_id')) {
            return;
        }

        if (! Schema::hasColumn($table, 'client_id')) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->unsignedBigInteger('client_id')->nullable()->after('user_id');
                $blueprint->index('client_id');
            });
        }

        DB::table($table)
            ->whereNotNull('user_id')
            ->whereNull('client_id')
            ->update(['client_id' => DB::raw('user_id')]);

        if (Schema::hasColumn($table, 'user_id')) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('user_id');
            });
        }
    }

    private function migrateWishlistItems(): void
    {
        if (! Schema::hasTable('wishlist_items') || ! Schema::hasColumn('wishlist_items', 'user_id')) {
            return;
        }

        if (! Schema::hasColumn('wishlist_items', 'client_id')) {
            Schema::table('wishlist_items', function (Blueprint $table) {
                $table->unsignedBigInteger('client_id')->nullable()->after('user_id');
            });
        }

        DB::table('wishlist_items')
            ->whereNotNull('user_id')
            ->whereNull('client_id')
            ->update(['client_id' => DB::raw('user_id')]);

        $this->dropAllForeignKeysOnTable('wishlist_items');
        $this->dropIndexOnColumns('wishlist_items', ['user_id', 'product_id']);
        $this->dropIndexOnColumns('wishlist_items', ['user_id', 'created_at']);

        if (Schema::hasColumn('wishlist_items', 'user_id')) {
            Schema::table('wishlist_items', function (Blueprint $table) {
                $table->dropColumn('user_id');
            });
        }

        if (Schema::hasColumn('wishlist_items', 'client_id')) {
            $this->addForeignKeyIfMissing('wishlist_items', 'client_id', 'clients', 'id', 'cascade');
            $this->addForeignKeyIfMissing('wishlist_items', 'product_id', 'products', 'id', 'cascade');
            $this->addUniqueIfMissing('wishlist_items', ['client_id', 'product_id']);
            $this->addIndexIfMissing('wishlist_items', ['client_id', 'created_at']);
        }
    }

    private function migrateDiscountCardsPivot(): void
    {
        if (Schema::hasTable('user_discount_cards')) {
            Schema::rename('user_discount_cards', 'client_discount_cards');
        }

        if (! Schema::hasTable('client_discount_cards')) {
            return;
        }

        if (Schema::hasColumn('client_discount_cards', 'user_id')) {
            $this->dropAllForeignKeysOnTable('client_discount_cards');
            $this->dropUniqueOnColumns('client_discount_cards', ['discount_card_id', 'user_id']);

            Schema::table('client_discount_cards', function (Blueprint $table) {
                $table->renameColumn('user_id', 'client_id');
            });
        }

        if (Schema::hasColumn('client_discount_cards', 'client_id')) {
            $this->addForeignKeyIfMissing('client_discount_cards', 'client_id', 'clients', 'id', 'cascade');
            $this->addForeignKeyIfMissing('client_discount_cards', 'discount_card_id', 'discount_cards', 'id', 'cascade');
            $this->addUniqueIfMissing('client_discount_cards', ['discount_card_id', 'client_id']);
        }
    }

    private function migrateGiftCertificates(): void
    {
        if (! Schema::hasTable('gift_certificates')) {
            return;
        }

        if (Schema::hasColumn('gift_certificates', 'purchaser_user_id')) {
            $this->dropForeignKeysOnColumn('gift_certificates', 'purchaser_user_id');

            Schema::table('gift_certificates', function (Blueprint $table) {
                $table->renameColumn('purchaser_user_id', 'purchaser_client_id');
            });
        }

        if (Schema::hasColumn('gift_certificates', 'purchaser_client_id')) {
            $this->addForeignKeyIfMissing('gift_certificates', 'purchaser_client_id', 'clients', 'id', 'set null');
        }

        if (Schema::hasColumn('gift_certificates', 'issued_to_user_id')) {
            $this->dropForeignKeysOnColumn('gift_certificates', 'issued_to_user_id');

            Schema::table('gift_certificates', function (Blueprint $table) {
                $table->renameColumn('issued_to_user_id', 'issued_to_client_id');
            });
        }

        if (Schema::hasColumn('gift_certificates', 'issued_to_client_id')) {
            $this->addForeignKeyIfMissing('gift_certificates', 'issued_to_client_id', 'clients', 'id', 'set null');
        }
    }

    private function dropAllForeignKeysOnTable(string $table): void
    {
        $foreignKeys = DB::select(
            'SELECT DISTINCT CONSTRAINT_NAME
             FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND CONSTRAINT_TYPE = ?',
            [$table, 'FOREIGN KEY']
        );

        foreach ($foreignKeys as $foreignKey) {
            $name = (string) $foreignKey->CONSTRAINT_NAME;
            if ($name === '') {
                continue;
            }

            DB::statement("ALTER TABLE `{$table}` DROP FOREIGN KEY `{$name}`");
        }
    }

    private function dropForeignKeysOnColumn(string $table, string $column): void
    {
        $foreignKeys = DB::select(
            'SELECT CONSTRAINT_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?
               AND REFERENCED_TABLE_NAME IS NOT NULL',
            [$table, $column]
        );

        foreach ($foreignKeys as $foreignKey) {
            $name = (string) $foreignKey->CONSTRAINT_NAME;
            if ($name === '') {
                continue;
            }

            DB::statement("ALTER TABLE `{$table}` DROP FOREIGN KEY `{$name}`");
        }
    }

    private function dropUniqueOnColumns(string $table, array $columns): void
    {
        $indexName = $this->findIndexName($table, $columns, unique: true);
        if ($indexName === null) {
            return;
        }

        DB::statement("ALTER TABLE `{$table}` DROP INDEX `{$indexName}`");
    }

    private function dropIndexOnColumns(string $table, array $columns): void
    {
        $indexName = $this->findIndexName($table, $columns, unique: false);
        if ($indexName === null) {
            return;
        }

        DB::statement("ALTER TABLE `{$table}` DROP INDEX `{$indexName}`");
    }

    /**
     * @param  array<int, string>  $columns
     */
    private function findIndexName(string $table, array $columns, bool $unique): ?string
    {
        $indexes = DB::select(
            'SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
             GROUP BY INDEX_NAME, NON_UNIQUE',
            [$table]
        );

        $expected = implode(',', $columns);

        foreach ($indexes as $index) {
            $isUnique = (int) ($index->NON_UNIQUE ?? 1) === 0;
            if ($isUnique !== $unique) {
                continue;
            }

            if ((string) ($index->cols ?? '') === $expected) {
                return (string) $index->INDEX_NAME;
            }
        }

        return null;
    }

    private function addForeignKeyIfMissing(
        string $table,
        string $column,
        string $referencedTable,
        string $referencedColumn,
        string $onDelete
    ): void {
        $exists = DB::select(
            'SELECT CONSTRAINT_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?
               AND REFERENCED_TABLE_NAME = ?
             LIMIT 1',
            [$table, $column, $referencedTable]
        );

        if ($exists !== []) {
            return;
        }

        $deleteRule = match ($onDelete) {
            'cascade' => 'CASCADE',
            'set null' => 'SET NULL',
            default => 'RESTRICT',
        };

        DB::statement(
            "ALTER TABLE `{$table}`
             ADD CONSTRAINT `{$table}_{$column}_foreign`
             FOREIGN KEY (`{$column}`) REFERENCES `{$referencedTable}` (`{$referencedColumn}`)
             ON DELETE {$deleteRule}"
        );
    }

    /**
     * @param  array<int, string>  $columns
     */
    private function addUniqueIfMissing(string $table, array $columns): void
    {
        if ($this->findIndexName($table, $columns, unique: true) !== null) {
            return;
        }

        $indexName = $table.'_'.implode('_', $columns).'_unique';
        $columnList = implode('`, `', $columns);

        DB::statement("ALTER TABLE `{$table}` ADD UNIQUE `{$indexName}` (`{$columnList}`)");
    }

    /**
     * @param  array<int, string>  $columns
     */
    private function addIndexIfMissing(string $table, array $columns): void
    {
        if ($this->findIndexName($table, $columns, unique: false) !== null) {
            return;
        }

        $indexName = $table.'_'.implode('_', $columns).'_index';
        $columnList = implode('`, `', $columns);

        DB::statement("ALTER TABLE `{$table}` ADD INDEX `{$indexName}` (`{$columnList}`)");
    }
};
