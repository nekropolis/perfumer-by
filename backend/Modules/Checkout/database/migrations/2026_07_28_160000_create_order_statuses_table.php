<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->string('color', 7)->default('#64748B');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false);
            $table->timestamps();

            $table->unique('code');
        });

        $now = now();
        $rows = [
            ['code' => 'new', 'name' => 'Новый', 'color' => '#15803D', 'sort_order' => 10],
            ['code' => 'confirmed', 'name' => 'Подтверждён', 'color' => '#1D4ED8', 'sort_order' => 20],
            ['code' => 'processing', 'name' => 'В обработке', 'color' => '#4338CA', 'sort_order' => 30],
            ['code' => 'in_delivery', 'name' => 'В доставке', 'color' => '#0E7490', 'sort_order' => 40],
            ['code' => 'preorder', 'name' => 'Предзаказ', 'color' => '#7E22CE', 'sort_order' => 50],
            ['code' => 'done', 'name' => 'Выполнен', 'color' => '#6B7280', 'sort_order' => 60],
            ['code' => 'cancelled', 'name' => 'Отменён', 'color' => '#DC2626', 'sort_order' => 70],
        ];

        foreach ($rows as $row) {
            DB::table('order_statuses')->insert([
                ...$row,
                'is_active' => true,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('order_statuses');
    }
};
