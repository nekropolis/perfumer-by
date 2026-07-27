<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('allparfume_shops')) {
            Schema::create('allparfume_shops', function (Blueprint $table): void {
                $table->id();
                $table->string('shop_key', 191)->unique();
                $table->string('shop_name', 255);
                $table->string('shop_url', 1024)->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedInteger('offers_count')->default(0);
                $table->timestamps();
                $table->index('is_active');
            });
        }

        if (! Schema::hasTable('allparfume_shop_offers')) {
            return;
        }

        $rows = DB::table('allparfume_shop_offers')
            ->selectRaw('shop_key, MAX(shop_name) as shop_name, MAX(shop_url) as shop_url, COUNT(*) as offers_count')
            ->whereNotNull('shop_key')
            ->where('shop_key', '!=', '')
            ->groupBy('shop_key')
            ->get();

        $now = now();
        foreach ($rows as $row) {
            $shopKey = (string) $row->shop_key;
            $isOwn = str_contains(mb_strtolower($shopKey), 'perfumer')
                || str_contains(mb_strtolower((string) $row->shop_name), 'perfumer');

            DB::table('allparfume_shops')->updateOrInsert(
                ['shop_key' => $shopKey],
                [
                    'shop_name' => (string) ($row->shop_name ?: $shopKey),
                    'shop_url' => $row->shop_url,
                    'is_active' => ! $isOwn,
                    'offers_count' => (int) $row->offers_count,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('allparfume_shops');
    }
};
