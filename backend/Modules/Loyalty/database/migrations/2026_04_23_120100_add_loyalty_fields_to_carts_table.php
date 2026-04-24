<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carts', function (Blueprint $table) {
            if (!Schema::hasColumn('carts', 'gift_certificate_code')) {
                $table->string('gift_certificate_code', 64)->nullable()->after('user_id');
            }

            if (!Schema::hasColumn('carts', 'discount_card_number')) {
                $table->string('discount_card_number', 64)->nullable()->after('gift_certificate_code');
            }

            if (!Schema::hasColumn('carts', 'discount_card_session_only')) {
                $table->boolean('discount_card_session_only')->default(false)->after('discount_card_number');
            }
        });
    }

    public function down(): void
    {
        Schema::table('carts', function (Blueprint $table) {
            if (Schema::hasColumn('carts', 'discount_card_session_only')) {
                $table->dropColumn('discount_card_session_only');
            }
            if (Schema::hasColumn('carts', 'discount_card_number')) {
                $table->dropColumn('discount_card_number');
            }
            if (Schema::hasColumn('carts', 'gift_certificate_code')) {
                $table->dropColumn('gift_certificate_code');
            }
        });
    }
};
