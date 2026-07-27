<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('allparfume_shop_offers')) {
            return;
        }

        $this->dropForeignKeys('allparfume_shop_offers');

        DB::statement('ALTER TABLE `allparfume_shop_offers` DROP INDEX `allparfume_offer_unique`');

        Schema::table('allparfume_shop_offers', function (Blueprint $table): void {
            $table->unique(
                ['allparfume_variant_id', 'shop_key', 'offer_url_hash'],
                'allparfume_offer_unique'
            );
            $table->foreign('allparfume_product_id', 'allparfume_shop_offers_product_fk')
                ->references('id')
                ->on('allparfume_products')
                ->cascadeOnDelete();
            $table->foreign('allparfume_variant_id', 'allparfume_shop_offers_variant_fk')
                ->references('id')
                ->on('allparfume_variants')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('allparfume_shop_offers')) {
            return;
        }

        $this->dropForeignKeys('allparfume_shop_offers');

        DB::statement('ALTER TABLE `allparfume_shop_offers` DROP INDEX `allparfume_offer_unique`');

        Schema::table('allparfume_shop_offers', function (Blueprint $table): void {
            $table->unique(
                ['allparfume_product_id', 'shop_key', 'offer_url_hash'],
                'allparfume_offer_unique'
            );
            $table->foreign('allparfume_product_id', 'allparfume_shop_offers_product_fk')
                ->references('id')
                ->on('allparfume_products')
                ->cascadeOnDelete();
            $table->foreign('allparfume_variant_id', 'allparfume_shop_offers_variant_fk')
                ->references('id')
                ->on('allparfume_variants')
                ->nullOnDelete();
        });
    }

    private function dropForeignKeys(string $table): void
    {
        $database = DB::getDatabaseName();
        $names = DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', $database)
            ->where('TABLE_NAME', $table)
            ->whereNotNull('REFERENCED_TABLE_NAME')
            ->distinct()
            ->pluck('CONSTRAINT_NAME');

        foreach ($names as $name) {
            DB::statement('ALTER TABLE `'.$table.'` DROP FOREIGN KEY `'.$name.'`');
        }
    }
};
