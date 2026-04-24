<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('variant_definitions', 'excludes_from_free_delivery_threshold')) {
            Schema::table('variant_definitions', function (Blueprint $table) {
                $table->boolean('excludes_from_free_delivery_threshold')->default(false)->after('is_tester');
            });
        }

        if (!Schema::hasColumn('product_variant_links', 'excludes_from_free_delivery_threshold')) {
            return;
        }

        $definitionIds = DB::table('product_variant_links')
            ->where('excludes_from_free_delivery_threshold', true)
            ->distinct()
            ->pluck('variant_definition_id')
            ->filter()
            ->values()
            ->all();

        if ($definitionIds !== []) {
            DB::table('variant_definitions')
                ->whereIn('id', $definitionIds)
                ->update(['excludes_from_free_delivery_threshold' => true]);
        }

        Schema::table('product_variant_links', function (Blueprint $table) {
            $table->dropColumn('excludes_from_free_delivery_threshold');
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('product_variant_links', 'excludes_from_free_delivery_threshold')) {
            Schema::table('product_variant_links', function (Blueprint $table) {
                $table->boolean('excludes_from_free_delivery_threshold')->default(false)->after('is_active');
            });
        }

        if (!Schema::hasColumn('variant_definitions', 'excludes_from_free_delivery_threshold')) {
            return;
        }

        $definitionIds = DB::table('variant_definitions')
            ->where('excludes_from_free_delivery_threshold', true)
            ->pluck('id')
            ->all();

        if ($definitionIds !== []) {
            DB::table('product_variant_links')
                ->whereIn('variant_definition_id', $definitionIds)
                ->update(['excludes_from_free_delivery_threshold' => true]);
        }
    }
};
