<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->boolean('is_old_design')->default(false)->after('is_set');
            $table->boolean('is_new_design')->default(false)->after('is_old_design');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->dropUnique('variant_definition_unique');
            $table->dropIndex('variant_definition_lookup_idx');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->index(
                ['volume_ml', 'volume_label', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set', 'is_old_design', 'is_new_design'],
                'variant_definition_lookup_idx',
            );
            $table->unique(
                ['volume_ml', 'volume_label', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set', 'is_old_design', 'is_new_design'],
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
                ['volume_ml', 'volume_label', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set'],
                'variant_definition_lookup_idx',
            );
            $table->unique(
                ['volume_ml', 'volume_label', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set'],
                'variant_definition_unique',
            );
            $table->dropColumn(['is_old_design', 'is_new_design']);
        });
    }
};
