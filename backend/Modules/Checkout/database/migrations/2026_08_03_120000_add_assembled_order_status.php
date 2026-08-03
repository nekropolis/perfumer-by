<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $exists = DB::table('order_statuses')->where('code', 'assembled')->exists();
        if ($exists) {
            return;
        }

        DB::table('order_statuses')->insert([
            'code' => 'assembled',
            'name' => 'Собран',
            'color' => '#B45309',
            'sort_order' => 35,
            'is_active' => true,
            'is_system' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        DB::table('order_statuses')->where('code', 'assembled')->delete();
    }
};
