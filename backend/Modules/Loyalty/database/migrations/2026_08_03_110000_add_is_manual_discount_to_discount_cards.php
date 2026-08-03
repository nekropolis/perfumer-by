<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('discount_cards', function (Blueprint $table) {
            if (! Schema::hasColumn('discount_cards', 'is_manual_discount')) {
                $table->boolean('is_manual_discount')->default(false)->after('discount_percent');
            }
        });
    }

    public function down(): void
    {
        Schema::table('discount_cards', function (Blueprint $table) {
            if (Schema::hasColumn('discount_cards', 'is_manual_discount')) {
                $table->dropColumn('is_manual_discount');
            }
        });
    }
};
