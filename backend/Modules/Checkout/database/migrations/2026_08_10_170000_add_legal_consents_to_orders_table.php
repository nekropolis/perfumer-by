<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->boolean('consent_offer')->default(false)->after('payment_method');
            $table->boolean('consent_privacy')->default(false)->after('consent_offer');
            $table->boolean('consent_marketing')->default(false)->after('consent_privacy');
            $table->timestamp('consents_accepted_at')->nullable()->after('consent_marketing');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'consent_offer',
                'consent_privacy',
                'consent_marketing',
                'consents_accepted_at',
            ]);
        });
    }
};
