<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_attribute_value_options', function (Blueprint $table) {
            $table->index(
                ['product_attribute_option_id', 'product_attribute_value_id'],
                'pavo_option_value_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('product_attribute_value_options', function (Blueprint $table) {
            $table->dropIndex('pavo_option_value_idx');
        });
    }
};
