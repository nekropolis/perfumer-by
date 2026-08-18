<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_view_snapshots', function (Blueprint $table) {
            $table->date('snapshot_on');
            $table->unsignedTinyInteger('position');
            $table->unsignedBigInteger('product_id');
            $table->primary(['snapshot_on', 'position']);
        });

        if (Schema::hasTable('home_recommended_products')) {
            $today = now('Europe/Minsk')->toDateString();
            $rows = DB::table('home_recommended_products')
                ->orderBy('position')
                ->get(['product_id', 'position']);

            foreach ($rows as $row) {
                DB::table('product_view_snapshots')->insert([
                    'snapshot_on' => $today,
                    'position' => (int) $row->position,
                    'product_id' => (int) $row->product_id,
                ]);
            }

            Schema::drop('home_recommended_products');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('product_view_snapshots');
    }
};
