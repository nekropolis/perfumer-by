<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_sets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('product_variant_link_id')
                ->nullable()
                ->constrained('product_variant_links')
                ->nullOnDelete();
            $table->string('title', 255)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['product_id', 'sort_order']);
            $table->unique('product_variant_link_id');
        });

        Schema::table('product_set_components', function (Blueprint $table) {
            $table->foreignId('product_set_id')
                ->nullable()
                ->after('id')
                ->constrained('product_sets')
                ->cascadeOnDelete();
        });

        // Перенос старых компонентов в один набор на товар (если были).
        $legacyByProduct = DB::table('product_set_components')
            ->whereNull('product_set_id')
            ->orderBy('product_id')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->groupBy('product_id');

        foreach ($legacyByProduct as $productId => $rows) {
            $setId = DB::table('product_sets')->insertGetId([
                'product_id' => (int) $productId,
                'product_variant_link_id' => null,
                'title' => 'Набор',
                'sort_order' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('product_set_components')
                ->where('product_id', (int) $productId)
                ->whereNull('product_set_id')
                ->update(['product_set_id' => $setId]);
        }

        Schema::table('product_set_components', function (Blueprint $table) {
            $table->dropForeign(['product_id']);
            $table->dropIndex(['product_id', 'sort_order']);
            $table->dropColumn('product_id');
        });

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
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set'],
                'variant_definition_lookup_idx',
            );
            $table->unique(
                ['volume_ml', 'concentration_code', 'is_tester', 'is_vial', 'is_miniature', 'is_set'],
                'variant_definition_unique',
            );
        });

        Schema::table('product_set_components', function (Blueprint $table) {
            $table->foreignId('product_id')
                ->nullable()
                ->after('id')
                ->constrained('products')
                ->cascadeOnDelete();
        });

        $sets = DB::table('product_sets')->get(['id', 'product_id']);
        foreach ($sets as $set) {
            DB::table('product_set_components')
                ->where('product_set_id', $set->id)
                ->update(['product_id' => $set->product_id]);
        }

        Schema::table('product_set_components', function (Blueprint $table) {
            $table->dropForeign(['product_set_id']);
            $table->dropColumn('product_set_id');
            $table->index(['product_id', 'sort_order']);
        });

        Schema::dropIfExists('product_sets');
    }
};
