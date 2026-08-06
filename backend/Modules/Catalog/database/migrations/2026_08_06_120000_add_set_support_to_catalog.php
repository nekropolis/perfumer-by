<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('is_set')->default(false)->after('is_hit');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->dropUnique('variant_definition_unique');
            $table->dropIndex('variant_definition_lookup_idx');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->boolean('is_set')->default(false)->after('is_miniature');
            $table->string('volume_label', 120)->nullable()->after('volume_ml');
        });

        DB::statement('ALTER TABLE variant_definitions MODIFY volume_ml DECIMAL(8,1) UNSIGNED NULL');

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->index(
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set'],
                'variant_definition_lookup_idx',
            );
            $table->unique(
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set'],
                'variant_definition_unique',
            );
        });

        Schema::create('product_set_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('volume_label', 80);
            $table->string('concentration_label', 120);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['product_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_set_components');

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->dropUnique('variant_definition_unique');
            $table->dropIndex('variant_definition_lookup_idx');
        });

        Schema::table('variant_definitions', function (Blueprint $table) {
            $table->dropColumn(['is_set', 'volume_label']);
        });

        DB::statement('ALTER TABLE variant_definitions MODIFY volume_ml DECIMAL(8,1) UNSIGNED NOT NULL');

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

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('is_set');
        });
    }
};
