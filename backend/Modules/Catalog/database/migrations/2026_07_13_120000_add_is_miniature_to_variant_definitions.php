<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->boolean('is_miniature')->default(false)->after('is_vial');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->dropUnique('variant_definition_unique');
            $table->dropIndex('variant_definition_lookup_idx');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->index(
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature'],
                'variant_definition_lookup_idx',
            );
            $table->unique(
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature'],
                'variant_definition_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->dropUnique('variant_definition_unique');
            $table->dropIndex('variant_definition_lookup_idx');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->index(
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial'],
                'variant_definition_lookup_idx',
            );
            $table->unique(
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial'],
                'variant_definition_unique',
            );
            $table->dropColumn('is_miniature');
        });
    }
};
