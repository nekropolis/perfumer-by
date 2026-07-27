<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('allparfume_shop_offers', function (Blueprint $table): void {
            $table->boolean('include_in_pricing')->default(true)->after('is_active');
            $table->index(['include_in_pricing', 'is_active'], 'allparfume_shop_offers_pricing_idx');
        });

        // Deactivate own shop offers if already stored.
        DB::table('allparfume_shop_offers')
            ->where(function ($q): void {
                $q->whereRaw('LOWER(shop_key) LIKE ?', ['perfumer-by%'])
                    ->orWhereRaw('LOWER(shop_key) = ?', ['perfumer.by'])
                    ->orWhereRaw('LOWER(REPLACE(shop_name, " ", "")) LIKE ?', ['%perfumer.by%'])
                    ->orWhereRaw('LOWER(REPLACE(shop_name, " ", "")) LIKE ?', ['%perfumer-by%']);
            })
            ->update([
                'is_active' => false,
                'include_in_pricing' => false,
            ]);
    }

    public function down(): void
    {
        Schema::table('allparfume_shop_offers', function (Blueprint $table): void {
            $table->dropIndex('allparfume_shop_offers_pricing_idx');
            $table->dropColumn('include_in_pricing');
        });
    }
};
