<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private const ENABLED_CODES = [
        'new',
        'confirmed',
        'processing',
        'preorder',
        'v_ozidanii_poiavleniia',
    ];

    public function up(): void
    {
        Schema::table('order_statuses', function (Blueprint $table): void {
            $table->boolean('show_in_order_products')
                ->default(false)
                ->after('is_system');
        });

        DB::table('order_statuses')
            ->whereIn('code', self::ENABLED_CODES)
            ->update([
                'show_in_order_products' => true,
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        Schema::table('order_statuses', function (Blueprint $table): void {
            $table->dropColumn('show_in_order_products');
        });
    }
};
