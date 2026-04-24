<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('value')->nullable();
            $table->timestamps();
        });

        $defaults = [
            'delivery_minsk_free_threshold' => '50',
            'delivery_minsk_fee' => '3',
            'delivery_belarus_fee' => '6',
            'delivery_belarus_free_min_lines' => '2',
        ];

        foreach ($defaults as $key => $value) {
            DB::table('shop_settings')->insert([
                'key' => $key,
                'value' => $value,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_settings');
    }
};
