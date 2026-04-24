<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'discount_card_id')) {
                $table->foreignId('discount_card_id')->nullable()->after('total')->constrained('discount_cards')->nullOnDelete();
            }
            if (!Schema::hasColumn('orders', 'discount_card_number')) {
                $table->string('discount_card_number', 64)->nullable()->after('discount_card_id');
            }
            if (!Schema::hasColumn('orders', 'discount_percent_snapshot')) {
                $table->decimal('discount_percent_snapshot', 5, 2)->default(0)->after('discount_card_number');
            }
            if (!Schema::hasColumn('orders', 'discount_amount')) {
                $table->decimal('discount_amount', 12, 2)->default(0)->after('discount_percent_snapshot');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'discount_card_id')) {
                $table->dropConstrainedForeignId('discount_card_id');
            }
            foreach (['discount_amount', 'discount_percent_snapshot', 'discount_card_number'] as $column) {
                if (Schema::hasColumn('orders', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
