<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Парсинг нескольких прайсов (EDP / Lagdos) использует один формат
 * external_url = supplier-xls://{code}. Глобальный unique на URL ломал второй поставщик.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supplier_products', function (Blueprint $table) {
            $table->dropUnique('supplier_products_external_url_unique');
            $table->unique(
                ['supplier_id', 'external_url'],
                'supplier_products_supplier_id_external_url_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::table('supplier_products', function (Blueprint $table) {
            $table->dropUnique('supplier_products_supplier_id_external_url_unique');
            $table->unique('external_url', 'supplier_products_external_url_unique');
        });
    }
};
