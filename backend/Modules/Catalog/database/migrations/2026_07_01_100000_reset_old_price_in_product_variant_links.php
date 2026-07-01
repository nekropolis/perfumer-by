<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('product_variant_links')->update(['old_price' => null]);
    }

    public function down(): void
    {
        // Восстановить значения невозможно, так как они были перезаписаны автоматикой.
    }
};
