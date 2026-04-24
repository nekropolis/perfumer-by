<?php

/**
 * Историческое имя файла: изначально колонка добавлялась на product_variant_links.
 * Флаг перенесён на variant_definitions — одна настройка на тип варианта для всех товаров.
 */
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('variant_definitions', function (Blueprint $table) {
            if (!Schema::hasColumn('variant_definitions', 'excludes_from_free_delivery_threshold')) {
                $table->boolean('excludes_from_free_delivery_threshold')->default(false)->after('is_tester');
            }
        });
    }

    public function down(): void
    {
        Schema::table('variant_definitions', function (Blueprint $table) {
            if (Schema::hasColumn('variant_definitions', 'excludes_from_free_delivery_threshold')) {
                $table->dropColumn('excludes_from_free_delivery_threshold');
            }
        });
    }
};
